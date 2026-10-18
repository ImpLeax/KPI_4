import { Router } from 'express';
import { langQuerySchema } from '../validation/querySchemas.js';
import { parseOrThrow } from '../validation/validate.js';

export function createMaterialsRouter({ repository }) {
  const router = Router();

  router.get('/', (req, res) => {
    const { lang } = parseOrThrow(langQuerySchema, req.query, 'Invalid query parameters');
    res.json(repository.listMaterials(lang));
  });

  return router;
}
