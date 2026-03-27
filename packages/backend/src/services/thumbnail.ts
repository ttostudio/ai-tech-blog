import type { Sql } from '@ai-tech-blog/shared';
import { randomUUID } from 'node:crypto';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const COMFYUI_API_URL = process.env.COMFYUI_API_URL ?? 'http://host.docker.internal:3300';
const THUMBNAIL_DIR = '/data/thumbnails';
const IMAGE_WIDTH = 1024;
const IMAGE_HEIGHT = 576;

/** カテゴリ別プロンプトスタイル */
const CATEGORY_STYLES: Record<string, string> = {
  'claude-code': 'Minimalist digital workspace with code editor, AI assistant interface, dark theme',
  'ai-hacks': 'Creative tech innovation concept, colorful data streams, modern abstract',
  'ai-news': 'Breaking news concept with AI elements, digital globe, neural network',
  'tech': 'Technology concept with circuits, processors, futuristic design',
};

const DEFAULT_STYLE = 'Modern technology concept, clean digital illustration';

/** 記事のタイトルとカテゴリからプロンプトを生成 */
export function generatePrompt(title: string, category: string): string {
  const style = CATEGORY_STYLES[category] ?? DEFAULT_STYLE;
  return `${style}, representing the concept of "${title}", high quality, detailed, 4k resolution, professional illustration`;
}

/** ComfyUI flux-gguf ワークフローを構築 */
function buildWorkflow(prompt: string): Record<string, unknown> {
  return {
    '1': {
      class_type: 'DualCLIPLoader',
      inputs: {
        clip_name1: 'clip_l.safetensors',
        clip_name2: 't5xxl_fp8_e4m3fn.safetensors',
        type: 'flux',
      },
    },
    '2': {
      class_type: 'CLIPTextEncode',
      inputs: {
        text: prompt,
        clip: ['1', 0],
      },
    },
    '3': {
      class_type: 'UnetLoaderGGUF',
      inputs: {
        unet_name: 'flux1-schnell-Q4_K_S.gguf',
      },
    },
    '4': {
      class_type: 'RandomNoise',
      inputs: {
        noise_seed: Math.floor(Math.random() * 2 ** 32),
      },
    },
    '5': {
      class_type: 'BasicGuider',
      inputs: {
        model: ['3', 0],
        conditioning: ['2', 0],
      },
    },
    '6': {
      class_type: 'BasicScheduler',
      inputs: {
        scheduler: 'simple',
        steps: 4,
        denoise: 1,
        model: ['3', 0],
      },
    },
    '7': {
      class_type: 'EmptySD3LatentImage',
      inputs: {
        width: IMAGE_WIDTH,
        height: IMAGE_HEIGHT,
        batch_size: 1,
      },
    },
    '8': {
      class_type: 'SamplerCustomAdvanced',
      inputs: {
        noise: ['4', 0],
        guider: ['5', 0],
        sampler: ['9', 0],
        sigmas: ['6', 0],
        latent_image: ['7', 0],
      },
    },
    '9': {
      class_type: 'KSamplerSelect',
      inputs: {
        sampler_name: 'euler',
      },
    },
    '10': {
      class_type: 'VAELoader',
      inputs: {
        vae_name: 'ae.safetensors',
      },
    },
    '11': {
      class_type: 'VAEDecode',
      inputs: {
        samples: ['8', 0],
        vae: ['10', 0],
      },
    },
    '12': {
      class_type: 'SaveImage',
      inputs: {
        filename_prefix: 'thumbnail',
        images: ['11', 0],
      },
    },
  };
}

/** ComfyUI にワークフローをキューイングして画像を取得 */
async function executeComfyUI(prompt: string): Promise<Buffer> {
  const workflow = buildWorkflow(prompt);

  // キューにプロンプトを投入
  const queueRes = await fetch(`${COMFYUI_API_URL}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow }),
  });

  if (!queueRes.ok) {
    const body = await queueRes.text();
    throw new Error(`ComfyUI queue failed: ${queueRes.status} ${body}`);
  }

  const { prompt_id } = (await queueRes.json()) as { prompt_id: string };

  // ポーリングで完了を待つ（最大5分）
  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));

    const historyRes = await fetch(`${COMFYUI_API_URL}/history/${prompt_id}`);
    if (!historyRes.ok) continue;

    const history = (await historyRes.json()) as Record<string, {
      outputs?: Record<string, { images?: { filename: string; subfolder: string; type: string }[] }>;
    }>;

    const entry = history[prompt_id];
    if (!entry?.outputs) continue;

    // 出力ノード（SaveImage）から画像を取得
    for (const output of Object.values(entry.outputs)) {
      if (output.images && output.images.length > 0) {
        const img = output.images[0];
        const imageRes = await fetch(
          `${COMFYUI_API_URL}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder)}&type=${encodeURIComponent(img.type)}`,
        );
        if (!imageRes.ok) {
          throw new Error(`ComfyUI image download failed: ${imageRes.status}`);
        }
        return Buffer.from(await imageRes.arrayBuffer());
      }
    }
  }

  throw new Error('ComfyUI generation timed out after 5 minutes');
}

/** サムネイル生成メイン処理（非同期で呼ばれる） */
export async function generateThumbnail(sql: Sql, articleId: string, title: string, category: string): Promise<void> {
  const prompt = generatePrompt(title, category);

  // ステータスを generating に更新
  await sql`
    UPDATE articles
    SET thumbnail_status = 'generating', thumbnail_prompt = ${prompt}, thumbnail_error = NULL
    WHERE id = ${articleId}
  `;

  try {
    const imageBuffer = await executeComfyUI(prompt);

    // ファイルを保存
    await mkdir(THUMBNAIL_DIR, { recursive: true });
    const filename = `${articleId}-${randomUUID().slice(0, 8)}.png`;
    const filepath = join(THUMBNAIL_DIR, filename);
    await writeFile(filepath, imageBuffer);

    const thumbnailUrl = `/thumbnails/${filename}`;

    // DB更新: completed
    await sql`
      UPDATE articles
      SET thumbnail_url = ${thumbnailUrl},
          thumbnail_status = 'completed',
          thumbnail_generated_at = NOW()
      WHERE id = ${articleId}
    `;

    console.log(`サムネイル生成完了: ${articleId} → ${thumbnailUrl}`);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`サムネイル生成失敗: ${articleId}`, errorMessage);

    // DB更新: failed
    await sql`
      UPDATE articles
      SET thumbnail_status = 'failed', thumbnail_error = ${errorMessage}
      WHERE id = ${articleId}
    `;
  }
}
