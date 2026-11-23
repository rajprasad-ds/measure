# Manual test checklist

Run the automated checks first: `npm test` and `npm run build`. The GitHub Actions workflow also runs tests, type-checking, and a production build on each branch update.

## 1. Account and local session

1. Confirm the app requires Google sign-in. Sign in, refresh, and confirm the Supabase session is restored. Sign out and confirm the app returns to the sign-in screen.
2. Start a practice session with a subject, chapter, duration, and starting question number. Confirm topic selection is not part of session setup.
3. Start/stop question timers, skip a question, refresh during an active session, and resume it. Confirm the question number and elapsed times survive reload.
4. Let the global session timer reach zero. Confirm the session ends at its exact end timestamp and moves directly to feedback without overtime.
5. Leave an inactivity warning unanswered. Confirm it remains a warning and does not automatically terminate the session.

## 2. Normal-practice feedback

Test each of the five outcomes separately:

1. **Right and fast:** records result/time, creates no question card, and advances.
2. **Right but slow:** asks whether a faster/better method was found. No means no card. Yes captures, in order: question image, faster method (text/images/both), intrinsic difficulty, then topic attribution. The faster method must be stored as the new card's solution.
3. **Wrong:** asks for exactly one primary cause first, then requires a question image, a solution (text, one or more ordered images, or both), intrinsic difficulty, and topic attribution. Forgotten fact/formula additionally requires linking or creating a fact card.
4. **Couldn't solve:** follows the same required capture sequence as Wrong, but does not offer calculation/execution slip as a cause.
5. **Wrong question:** records result/time, creates no question card, asks for no cause, and contributes to neither accuracy nor topic-weakness signals.

Also verify:
- The question label is optional; the question image is mandatory.
- A solution can be text-only, image-only, or text plus multiple ordered images.
- Easy/Medium/Hard is mandatory for each new question card and cannot be changed after it is saved.
- The searchable topic picker appears in the individual feedback flow, not session setup.
- Back navigation preserves entered data and returns to the correct previous step.
- A forgotten fact/formula cannot be bypassed; feedback cannot complete until a fact card is linked or created.
- Only one primary cause is stored. A slip subtype is optional detail, not another primary cause.

## 3. Fact cards

1. Create a fact card with text-only front and image-only back.
2. Create another with image-only front and text-only back.
3. Confirm each side rejects being completely empty.
4. Create and link a fact card from a Forgotten fact/formula question. Confirm the link appears from both card details.
5. Link an existing fact card and confirm it satisfies the dependency. Try to finish without resolving the dependency and confirm the app blocks completion.

## 4. Session summary

1. Confirm the summary shows total timed questions, Right and fast, Right but slow, Wrong, Couldn't solve, Wrong question, active time, average time per question, and accuracy.
2. Confirm question-card and linked/created fact-card counts are correct.
3. Confirm **View question details** is collapsed by default and expands to show each question's result, time, cause, topics, intrinsic difficulty, and linked fact count where applicable.
4. Confirm Wrong question is included in total timed questions but excluded from accuracy and weakness signals.

## 5. Local persistence, cloud sync, and images

1. In browser developer tools, inspect the IndexedDB `jee-practice` database. Confirm sessions, attempts, question cards, fact cards, links, image metadata, and image blobs persist after reload.
2. Confirm each signed-in user's session/card/link/image metadata records are associated with the authenticated Supabase user ID.
3. Apply these new Supabase migrations in timestamp order after the existing migrations:
   - `20261123120000_wrong_question_attempts.sql`
   - `20261123130000_question_difficulty.sql`
   - `20261123140000_question_solution_image_list.sql`
   - `20261123150000_fact_card_text_or_image.sql`
4. Confirm Google Drive API is enabled in the Google Cloud project and the OAuth web client has `http://localhost:5173` and the production app origin under Authorized JavaScript origins. `.env.local` must contain `VITE_GOOGLE_CLIENT_ID` using that web client ID. Do not put the client secret in frontend environment variables.
5. Select a photo. If Drive access has not been granted, use **Connect Google Drive** / **Reconnect Google Drive**, grant the `drive.file` permission, and confirm the image status changes to Uploaded.
6. Confirm image metadata syncs to Supabase after upload and contains the Drive remote ID. Confirm the card's image reference survives reload.
7. Test with multiple solution images. Confirm their order is preserved after reload and cloud sync.
8. Test offline: create feedback and cards while offline, then reconnect. Confirm local records remain intact and sync without duplicates.
9. Sign in on another device/browser and confirm cards, fact links, and images can be retrieved. Do not treat a card record syncing as proof that its image bytes and Drive metadata also synced.

## 6. Session commit integrity

1. Attempt to save a session with a timed question missing its result, cause, question card, solution, difficulty, required topic, or forgotten-fact link. Confirm the session is not committed.
2. After all required feedback is complete, save the session and confirm exactly one attempt record exists per timed question.
3. Repeat sync and confirm no duplicate sessions, attempts, cards, links, or image metadata are created.