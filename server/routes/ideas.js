import { Router } from 'express';
import { notFoundError, validationError } from '../errors.js';
import {
  assertSupportedPhoto,
  parseIdeaForm,
  removeStoredPhoto,
  storePhoto,
} from '../middleware/upload.js';
import { ideaFormSchema } from '../validation/ideaFormSchema.js';
import {
  ideaIdParamSchema,
  ideasQuerySchema,
  langQuerySchema,
} from '../validation/querySchemas.js';
import { parseOrThrow, toErrorDetails } from '../validation/validate.js';

const IDEA_NOT_FOUND = 'Idea not found';

/**
 * Validates the multipart text fields, photo presence and that referenced materials/tools exist.
 * All problems are reported together as one 400 VALIDATION_ERROR.
 */
function validateIdeaForm(repository, body, { photoRequired, hasPhoto }) {
  const result = ideaFormSchema.safeParse(body ?? {});
  const details = result.success ? [] : toErrorDetails(result.error);

  if (photoRequired && !hasPhoto) {
    details.push({ field: 'photo', message: 'Field is required' });
  }

  if (result.success) {
    const form = result.data;
    const unknownMaterials = new Set(
      repository.findUnknownMaterialIds(form.materials.map((material) => material.materialId)),
    );
    form.materials.forEach((material, index) => {
      if (unknownMaterials.has(material.materialId)) {
        details.push({ field: `materials[${index}].materialId`, message: 'Unknown material id' });
      }
    });
    const unknownTools = new Set(repository.findUnknownToolIds(form.tools));
    form.tools.forEach((toolId, index) => {
      if (unknownTools.has(toolId)) {
        details.push({ field: `tools[${index}]`, message: 'Unknown tool id' });
      }
    });
  }

  if (details.length > 0) {
    throw validationError('Invalid idea form', details);
  }
  return result.data;
}

const parseId = (params) => parseOrThrow(ideaIdParamSchema, params, 'Invalid idea id').id;

/**
 * Stores the uploaded photo, runs `write(photoUrl)` and removes the stored file again if
 * `write` fails, so failed requests do not leave orphan files behind.
 */
async function withStoredPhoto(uploadDir, file, extension, write) {
  if (!file) return write(undefined);
  const photoUrl = await storePhoto(uploadDir, file.buffer, extension);
  try {
    return write(photoUrl);
  } catch (err) {
    await removeStoredPhoto(uploadDir, photoUrl);
    throw err;
  }
}

export function createIdeasRouter({ repository, uploadDir }) {
  const router = Router();

  router.get('/', (req, res) => {
    const query = parseOrThrow(ideasQuerySchema, req.query, 'Invalid query parameters');
    res.json(repository.listIdeas(query));
  });

  router.get('/:id', (req, res) => {
    const id = parseId(req.params);
    const { lang } = parseOrThrow(langQuerySchema, req.query, 'Invalid query parameters');
    const idea = repository.getIdea(id, lang);
    if (!idea) throw notFoundError(IDEA_NOT_FOUND);
    res.json(idea);
  });

  router.post('/', parseIdeaForm, async (req, res) => {
    const extension = req.file ? assertSupportedPhoto(req.file) : null;
    const form = validateIdeaForm(repository, req.body, {
      photoRequired: true,
      hasPhoto: Boolean(req.file),
    });

    const id = await withStoredPhoto(uploadDir, req.file, extension, (photoUrl) =>
      repository.createIdea(form, photoUrl),
    );
    res.status(201).location(`/api/ideas/${id}`).json(repository.getIdea(id, form.lang));
  });

  router.put('/:id', parseIdeaForm, async (req, res) => {
    const id = parseId(req.params);
    if (!repository.ideaExists(id)) throw notFoundError(IDEA_NOT_FOUND);

    const extension = req.file ? assertSupportedPhoto(req.file) : null;
    const form = validateIdeaForm(repository, req.body, {
      photoRequired: false,
      hasPhoto: Boolean(req.file),
    });

    // The previous photo URL is read in the same synchronous step as the update: storing the new
    // file awaits, and a concurrent PUT could replace the photo in between (orphaning a file).
    const previousPhotoUrl = await withStoredPhoto(uploadDir, req.file, extension, (photoUrl) => {
      const previous = repository.getPhotoUrl(id);
      if (!repository.updateIdea(id, form, photoUrl)) throw notFoundError(IDEA_NOT_FOUND);
      return previous;
    });
    if (req.file) {
      await removeStoredPhoto(uploadDir, previousPhotoUrl);
    }
    res.json(repository.getIdea(id, form.lang));
  });

  router.delete('/:id', async (req, res) => {
    const id = parseId(req.params);
    const { deleted, photoUrl } = repository.deleteIdea(id);
    if (!deleted) throw notFoundError(IDEA_NOT_FOUND);
    await removeStoredPhoto(uploadDir, photoUrl);
    res.status(204).end();
  });

  return router;
}
