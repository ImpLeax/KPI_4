import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  MAX_PHOTO_BYTES,
  createTestApp,
  detailFields,
  expectErrorShape,
  jpegPhoto,
  pngOfSize,
  pngPhoto,
  validIdeaFields,
  withForm,
} from '../helpers/testApp.js';

// A fresh database and upload dir per test keeps write tests independent of each other.
let ctx;
beforeEach(() => {
  ctx = createTestApp();
});
afterEach(() => ctx.cleanup());

const post = (fields, photo) => withForm(request(ctx.app).post('/api/ideas'), fields, photo);
const put = (id, fields, photo) =>
  withForm(request(ctx.app).put(`/api/ideas/${id}`), fields, photo);
const webpPhoto = () => {
  const buffer = Buffer.alloc(32);
  buffer.write('RIFF', 0, 'latin1');
  buffer.writeUInt32LE(24, 4);
  buffer.write('WEBPVP8 ', 8, 'latin1');
  return { buffer, filename: 'photo.webp', contentType: 'image/webp' };
};

describe('POST /api/ideas', () => {
  it('creates an idea and returns 201 with Location and the idea in the submitted language', async () => {
    const res = await post(validIdeaFields(), pngPhoto());
    expect(res.status).toBe(201);
    expect(res.headers.location).toBe(`/api/ideas/${res.body.id}`);
    expect(res.body.id).toBe(26);
    expect(res.body).toMatchObject({
      title: 'Test bottle lantern',
      description: 'A lantern made from a plastic bottle.',
      category: 'decor',
      difficulty: 'easy',
      estimatedTime: 25,
      materials: [
        { id: 1, name: 'Plastic bottle (1.5 L or larger)', isRequired: true, quantity: '1 pc' },
        { id: 22, name: 'Acrylic paint', isRequired: false, quantity: null },
      ],
      tools: [
        { id: 1, name: 'Scissors' },
        { id: 3, name: 'Utility knife' },
      ],
      steps: [
        { number: 1, text: 'Cut the bottle in half' },
        { number: 2, text: 'Paint the outside' },
      ],
    });
    expect(res.body.photoUrl).toMatch(/^\/uploads\/[0-9a-f-]{36}\.png$/);
    expect(res.body.createdAt).toEqual(expect.any(String));
  });

  it('stores the photo under a random name and serves it from /uploads', async () => {
    const photo = pngPhoto();
    const res = await post(validIdeaFields(), photo);
    expect(ctx.uploadedFiles()).toEqual([res.body.photoUrl.slice('/uploads/'.length)]);

    const file = await request(ctx.app).get(res.body.photoUrl);
    expect(file.status).toBe(200);
    expect(file.type).toBe('image/png');
    expect(Buffer.compare(file.body, photo.buffer)).toBe(0);
  });

  it('makes the new idea appear in the catalog and in recommendations', async () => {
    const created = await post(validIdeaFields(), pngPhoto());
    const catalog = await request(ctx.app).get('/api/ideas');
    expect(catalog.body.total).toBe(26);
    expect(catalog.body.items.map((item) => item.id)).toContain(created.body.id);

    const recommended = await request(ctx.app).get('/api/ideas?materials=1&category=decor');
    expect(recommended.body.items).toEqual([
      expect.objectContaining({ id: created.body.id, matchType: 'partial' }),
    ]);
    const full = await request(ctx.app).get('/api/ideas?materials=1,22&category=decor');
    expect(full.body.items[0]).toMatchObject({ id: created.body.id, matchType: 'full' });
  });

  it('falls back to the submitted language when reading in the other language', async () => {
    const created = await post(validIdeaFields({ lang: 'en' }), pngPhoto());
    const uk = await request(ctx.app).get(`/api/ideas/${created.body.id}?lang=uk`);
    expect(uk.body.title).toBe('Test bottle lantern');
    expect(uk.body.steps[0].text).toBe('Cut the bottle in half');
    // Dictionary names are still localized.
    expect(uk.body.tools.map((tool) => tool.name)).toContain('Ножиці');
  });

  it('accepts a JPEG photo', async () => {
    const res = await post(validIdeaFields(), jpegPhoto());
    expect(res.status).toBe(201);
    expect(res.body.photoUrl).toMatch(/\.jpg$/);
  });

  it('accepts a WebP photo', async () => {
    const res = await post(validIdeaFields(), webpPhoto());
    expect(res.status).toBe(201);
    expect(res.body.photoUrl).toMatch(/\.webp$/);
  });

  it('accepts a photo of exactly 5 MB', async () => {
    const res = await post(validIdeaFields(), {
      buffer: pngOfSize(MAX_PHOTO_BYTES),
      contentType: 'image/png',
    });
    expect(res.status).toBe(201);
  });

  it('rejects a photo of 5 MB + 1 byte with 413 and stores nothing', async () => {
    const res = await post(validIdeaFields(), {
      buffer: pngOfSize(MAX_PHOTO_BYTES + 1),
      contentType: 'image/png',
    });
    expect(res.status).toBe(413);
    expectErrorShape(res.body, 'PAYLOAD_TOO_LARGE');
    expect(detailFields(res.body)).toEqual(['photo']);
    expect(ctx.uploadedFiles()).toEqual([]);
  });

  it('rejects a non-image photo with 415', async () => {
    const res = await post(validIdeaFields(), {
      buffer: Buffer.from('just some plain text, definitely not an image'),
      filename: 'notes.txt',
      contentType: 'text/plain',
    });
    expect(res.status).toBe(415);
    expectErrorShape(res.body, 'UNSUPPORTED_MEDIA_TYPE');
    expect(detailFields(res.body)).toEqual(['photo']);
  });

  it('rejects a file declared as PNG whose bytes are not an image (magic bytes) with 415', async () => {
    const res = await post(validIdeaFields(), {
      buffer: Buffer.from('<?php echo "not a png"; ?>'),
      filename: 'evil.png',
      contentType: 'image/png',
    });
    expect(res.status).toBe(415);
    expectErrorShape(res.body, 'UNSUPPORTED_MEDIA_TYPE');
  });

  it('rejects a GIF image with 415', async () => {
    const gif = Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00;', 'latin1');
    const res = await post(validIdeaFields(), {
      buffer: gif,
      filename: 'a.gif',
      contentType: 'image/gif',
    });
    expect(res.status).toBe(415);
  });

  it('requires a photo', async () => {
    const res = await post(validIdeaFields());
    expect(res.status).toBe(400);
    expectErrorShape(res.body, 'VALIDATION_ERROR');
    expect(res.body.error.details).toEqual([{ field: 'photo', message: 'Field is required' }]);
  });

  it('reports every invalid field in one 400 response', async () => {
    const res = await post(
      {
        lang: 'en',
        title: 'ab',
        category: 'food',
        difficulty: 'easy',
        estimatedTime: '0',
        materials: '[]',
        steps: '["ok"]',
      },
      null,
    );
    expect(res.status).toBe(400);
    expectErrorShape(res.body, 'VALIDATION_ERROR');
    expect(detailFields(res.body).sort()).toEqual(
      ['category', 'estimatedTime', 'materials', 'photo', 'steps[0]', 'title'].sort(),
    );
  });

  it('reports unknown material and tool ids with indexed field names and stores no file', async () => {
    const res = await post(
      validIdeaFields({
        materials: JSON.stringify([
          { materialId: 1, isRequired: true },
          { materialId: 999, isRequired: false },
        ]),
        tools: JSON.stringify([1, 777]),
      }),
      pngPhoto(),
    );
    expect(res.status).toBe(400);
    expect(res.body.error.details).toEqual([
      { field: 'materials[1].materialId', message: 'Unknown material id' },
      { field: 'tools[1]', message: 'Unknown tool id' },
    ]);
    expect(ctx.uploadedFiles()).toEqual([]);
  });

  it('accepts boundary values: title 3/120, time 1/1440, 30 steps, 20 materials, 15 tools', async () => {
    const steps = Array.from({ length: 30 }, (_, i) => `Step ${i + 1}`);
    const materials = Array.from({ length: 20 }, (_, i) => ({
      materialId: i + 1,
      isRequired: i === 0,
    }));
    const tools = Array.from({ length: 12 }, (_, i) => i + 1);
    for (const [title, estimatedTime] of [
      ['abc', '1'],
      ['t'.repeat(120), '1440'],
    ]) {
      const res = await post(
        validIdeaFields({
          title,
          estimatedTime,
          steps: JSON.stringify(steps),
          materials: JSON.stringify(materials),
          tools: JSON.stringify(tools),
        }),
        pngPhoto(),
      );
      expect(res.status).toBe(201);
      expect(res.body.steps).toHaveLength(30);
      expect(res.body.materials).toHaveLength(20);
    }
  });

  it.each([
    ['title', 't'.repeat(121)],
    ['estimatedTime', '1441'],
    ['steps', JSON.stringify(Array.from({ length: 31 }, () => 'Step text'))],
    ['materials', JSON.stringify([{ materialId: 1, isRequired: false }])],
    ['description', 'd'.repeat(1001)],
  ])('rejects an out-of-range %s with 400', async (field, value) => {
    const res = await post(validIdeaFields({ [field]: value }), pngPhoto());
    expect(res.status).toBe(400);
    expect(detailFields(res.body)).toEqual([field]);
    expect(ctx.uploadedFiles()).toEqual([]);
  });

  it('rejects a JSON body with 415 (multipart is required)', async () => {
    const res = await request(ctx.app).post('/api/ideas').send({ title: 'JSON idea' });
    expect(res.status).toBe(415);
    expectErrorShape(res.body, 'UNSUPPORTED_MEDIA_TYPE');
  });

  it('checks the photo type before validating the form fields', async () => {
    const res = await post(
      { title: 'x' },
      { buffer: Buffer.from('plain text'), contentType: 'text/plain' },
    );
    expect(res.status).toBe(415);
  });

  it('checks the photo size before anything else', async () => {
    const res = await post(
      { title: 'x' },
      { buffer: Buffer.alloc(MAX_PHOTO_BYTES + 1), contentType: 'text/plain' },
    );
    expect(res.status).toBe(413);
  });

  it('rejects a second file part with 400', async () => {
    const res = await post(validIdeaFields(), pngPhoto()).attach(
      'photo',
      Buffer.from(pngPhoto().buffer),
      {
        filename: 'second.png',
        contentType: 'image/png',
      },
    );
    expect(res.status).toBe(400);
    expectErrorShape(res.body, 'VALIDATION_ERROR');
    expect(ctx.uploadedFiles()).toEqual([]);
  });
});

describe('PUT /api/ideas/:id', () => {
  it('replaces all fields of a seed idea and keeps the current photo when none is sent', async () => {
    const res = await put(
      19,
      validIdeaFields({
        title: 'Paper boats, revised',
        difficulty: 'medium',
        estimatedTime: '15',
        materials: JSON.stringify([{ materialId: 6, isRequired: true, quantity: '2 sheets' }]),
        tools: '[]',
        steps: JSON.stringify(['Fold the sheet', 'Shape the boat', 'Launch it']),
      }),
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: 19,
      title: 'Paper boats, revised',
      difficulty: 'medium',
      estimatedTime: 15,
      photoUrl: '/images/seed/newspaper-boats.jpg',
      createdAt: '2026-08-31T16:20:00.000Z',
      materials: [{ id: 6, quantity: '2 sheets', isRequired: true }],
      tools: [],
      steps: [
        { number: 1, text: 'Fold the sheet' },
        { number: 2, text: 'Shape the boat' },
        { number: 3, text: 'Launch it' },
      ],
    });
    expect(res.body.updatedAt > '2026-08-31T16:20:00.000Z').toBe(true);
  });

  it('clears the other language so both languages show the edited text', async () => {
    await put(19, validIdeaFields({ lang: 'en', title: 'Edited in English', description: '' }));
    const uk = await request(ctx.app).get('/api/ideas/19?lang=uk');
    expect(uk.body.title).toBe('Edited in English');
    expect(uk.body.description).toBeNull();
    expect(uk.body.steps.map((s) => s.text)).toEqual([
      'Cut the bottle in half',
      'Paint the outside',
    ]);
  });

  it('replaces an uploaded photo and removes the old file', async () => {
    const created = await post(validIdeaFields(), pngPhoto());
    const oldFile = created.body.photoUrl.slice('/uploads/'.length);

    const res = await put(created.body.id, validIdeaFields(), jpegPhoto());
    expect(res.status).toBe(200);
    expect(res.body.photoUrl).toMatch(/\.jpg$/);
    expect(ctx.uploadedFiles()).toEqual([res.body.photoUrl.slice('/uploads/'.length)]);
    expect(ctx.uploadedFiles()).not.toContain(oldFile);
  });

  it('returns 404 for a missing idea', async () => {
    const res = await put(9999, validIdeaFields());
    expect(res.status).toBe(404);
    expectErrorShape(res.body, 'NOT_FOUND');
  });

  it('returns 400 for an invalid id', async () => {
    const res = await put('abc', validIdeaFields());
    expect(res.status).toBe(400);
    expectErrorShape(res.body, 'VALIDATION_ERROR');
  });

  it('returns 400 with details for invalid fields and leaves the idea unchanged', async () => {
    const res = await put(19, validIdeaFields({ title: '', steps: '[]' }));
    expect(res.status).toBe(400);
    expect(detailFields(res.body).sort()).toEqual(['steps', 'title']);
    const idea = await request(ctx.app).get('/api/ideas/19?lang=en');
    expect(idea.body.title).toBe('Newspaper origami boats');
  });

  it('rejects an unsupported photo with 415 and keeps the old photo', async () => {
    const res = await put(19, validIdeaFields(), {
      buffer: Buffer.from('not an image at all'),
      contentType: 'image/jpeg',
    });
    expect(res.status).toBe(415);
    const idea = await request(ctx.app).get('/api/ideas/19');
    expect(idea.body.photoUrl).toBe('/images/seed/newspaper-boats.jpg');
  });

  it('rejects a non-multipart body with 415', async () => {
    const res = await request(ctx.app).put('/api/ideas/19').send(validIdeaFields());
    expect(res.status).toBe(415);
  });
});

describe('DELETE /api/ideas/:id', () => {
  it('deletes a seed idea: 204, then 404 on read and it disappears from the catalog', async () => {
    const res = await request(ctx.app).delete('/api/ideas/19');
    expect(res.status).toBe(204);
    expect(res.text).toBe('');

    expect((await request(ctx.app).get('/api/ideas/19')).status).toBe(404);
    const catalog = await request(ctx.app).get('/api/ideas');
    expect(catalog.body.total).toBe(24);
    expect((await request(ctx.app).get('/api/ideas?materials=6')).body.total).toBe(0);
  });

  it('removes the uploaded photo of a created idea', async () => {
    const created = await post(validIdeaFields(), pngPhoto());
    expect(ctx.uploadedFiles()).toHaveLength(1);
    const res = await request(ctx.app).delete(`/api/ideas/${created.body.id}`);
    expect(res.status).toBe(204);
    expect(ctx.uploadedFiles()).toEqual([]);
    expect((await request(ctx.app).get(created.body.photoUrl)).status).toBe(404);
  });

  it('returns 404 when deleting the same idea twice', async () => {
    await request(ctx.app).delete('/api/ideas/1');
    const res = await request(ctx.app).delete('/api/ideas/1');
    expect(res.status).toBe(404);
    expectErrorShape(res.body, 'NOT_FOUND');
  });

  it('returns 400 for an invalid id', async () => {
    const res = await request(ctx.app).delete('/api/ideas/-5');
    expect(res.status).toBe(400);
    expectErrorShape(res.body, 'VALIDATION_ERROR');
  });
});
