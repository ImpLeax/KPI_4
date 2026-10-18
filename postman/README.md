# Postman-колекція Upcycling Ideas API

Файл `upcycling.postman_collection.json` — колекція Postman (формат v2.1) з запитами до всіх ендпоінтів API і базовими тестами: код статусу, форма JSON, формат помилки `{ error: { code, message, details? } }`.

## Підготовка

1. Скиньте БД до еталонного seed, бо тести перевіряють конкретні id із `server/db/SEED_NOTES.md`:
   ```bash
   npm run db:reset
   npm start            # http://localhost:3000
   ```
2. Рейт-ліміт записів (100 запитів / 15 хв) колекція не вичерпує. Якщо ганяєте її багато разів поспіль, запустіть сервер з `RATE_LIMIT=off`.

## Імпорт і запуск у Postman

1. Postman → **Import** → оберіть `postman/upcycling.postman_collection.json`.
2. Змінна колекції `baseUrl` за замовчуванням `http://localhost:3000`. Якщо сервер на іншому порту, змініть її у вкладці **Variables** колекції.
3. Запити з файлами (`Create idea (201)`, `Create with non-image photo (415)`) посилаються на файли проєкту за відносними шляхами: `public/images/seed/bottle-bird-feeder.jpg` і `package.json`. У Postman вкажіть корінь проєкту як робочу директорію (**Settings → General → Working directory**) або виберіть файл у полі `photo` вручну.
4. Запустіть усю колекцію: **Run collection** (Collection Runner). Папки йдуть у такому порядку:
   - `System`, `Dictionaries` — health, матеріали, інструменти, мова;
   - `Ideas - catalog` — каталог, фільтри складності, категорії, пошук, сортування;
   - `Ideas - recommendations` — сценарії підбору S1, S5, S8, S9 і некоректний список матеріалів;
   - `Ideas - details` — майстер-клас, 404, некоректний id;
   - `Ideas - write` — створення → читання іншою мовою → редагування → помилки 400/415 → видалення → 404.

   Папку `Ideas - write` треба запускати цілком і по порядку: id створеної ідеї зберігається в змінну `createdIdeaId`, а наприкінці ідея видаляється разом із фото.

## Запуск з командного рядка (Newman, необов'язково)

Newman не входить у залежності проєкту. Його можна запустити разово через `npx` з кореня проєкту (щоб спрацювали відносні шляхи до файлів):

```bash
npx newman run postman/upcycling.postman_collection.json
# інший порт:
npx newman run postman/upcycling.postman_collection.json --env-var baseUrl=http://localhost:3200
```

Очікуваний результат на свіжій БД: 28 запитів, 65 перевірок, 0 помилок.
