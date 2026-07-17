const baseUrl = (process.env.OBSREC_AI_API_URL || 'http://localhost:5173').replace(/\/+$/, '');
const shouldTestAI = process.argv.includes('--ai');

async function post(pathname, body) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-OBSREC-Install-Id': '123e4567-e89b-42d3-a456-426614174000',
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  return { response, payload };
}

async function get(pathname) {
  const response = await fetch(`${baseUrl}${pathname}`);
  const payload = await response.json().catch(() => null);
  return { response, payload };
}

function assertOk(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const sampleRequest = {
  systemInfo: {
    cpu: { model: 'Apple M3', cores: 8, speed: 3.5 },
    gpu: { model: 'Apple M3 GPU', vram: 8192, vendor: 'Apple', hasNvenc: false },
    ram: { total: 16 },
    os: { platform: 'darwin', distro: 'macOS', release: '15.5' },
  },
  mode: 'stream_record',
  platform: 'twitch',
};

const recommendationShape = {
  resolution: '1920x1080',
  fps: 60,
  encoder: 'apple vt h264',
  bitrate: 6000,
  audio_bitrate: 320,
  recording_format: 'mkv',
  recording_quality: 'stream',
};

try {
  console.log(`Testing OBSREC AI backend at ${baseUrl}`);

  const health = await get('/api/health');
  assertOk(health.response.ok, `/api/health failed with ${health.response.status}`);
  assertOk(health.payload?.ok === true, '/api/health did not return ok=true');
  console.log('health ok', health.payload);

  if (shouldTestAI) {
    const recommendation = await post('/api/recommendation', sampleRequest);
    assertOk(recommendation.response.ok, `/api/recommendation failed with ${recommendation.response.status}`);
    assertOk(recommendation.payload?.source === 'ai', '/api/recommendation did not return source=ai');
    assertOk(recommendation.payload?.recommendations?.resolution, '/api/recommendation returned an invalid shape');
    console.log('recommendation ok', recommendation.payload.recommendations);

    const explanation = await post('/api/explanation', {
      ...sampleRequest,
      originalRecommendations: recommendation.payload.recommendations,
      currentRecommendations: {
        ...recommendationShape,
        bitrate: 4500,
      },
      changedFields: ['bitrate'],
    });
    assertOk(explanation.response.ok, `/api/explanation failed with ${explanation.response.status}`);
    assertOk(explanation.payload?.source === 'ai', '/api/explanation did not return source=ai');
    assertOk(typeof explanation.payload?.reasoning === 'string', '/api/explanation returned an invalid shape');
    console.log('explanation ok');
  } else {
    console.log('Skipping AI requests. Run with --ai to test recommendation and explanation.');
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Backend smoke test failed: ${message}`);
  console.error('Run pnpm dev locally or set OBSREC_AI_API_URL to another backend URL.');
  process.exitCode = 1;
}
