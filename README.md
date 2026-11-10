# Puffer Companion v2

## Slime input fix (extension v2.2.1)

No new EXE is needed for this update. Reload Puffer Companion in the browser's Extensions page, close the old game tab, then click Launch Krillion in the yellow desktop app. The panel header must show **v2.2.1 / LIVE**.

Slime now prepares the top untried suggestion even before your turn and recognizes **your puffer**. It tries Enter at controlled intervals while waiting (about 1.2 seconds), and submits as the puffer arrives. Fresh nearby rejection/error/shake feedback skips to the next untried suggestion. Input clearing after submission also advances the queue for the next turn. Not-your-turn feedback keeps the prepared word. Attempts are category scoped and do not count as accepted answers; actual played-word detection remains separate.

A dedicated auto-play status line shows why it is waiting. If the answer textbox isn't detected, click **Choose answer box**, then click inside the game's answer textbox once. Existing manual text is preserved. OFF or Escape stops the mode and clears only text it owns. Acceptance/rejection detection depends on the game markup; arbitrary unrelated page changes do not discard a word. Live-game verification remains unavailable.

## Yellow streaming release (v2.2)

Temporary service/network failures (including Gemini HTTP 503) now retry automatically after 1 second and then 3 seconds. If all three attempts fail, continuous mode waits 30 seconds before trying again while the tab remains visible and the category is active. Pause/category changes cancel pending work. Invalid keys, permission failures, and quota errors stop rather than retrying in a tight loop. **Refresh now** is optional for asking for an extra batch; it is not required to recover from a transient 503.

Run **PufferHelper-Yellow.exe**. Close the older app first. All new UI uses yellow. **SLIME THEM OUT** is directly below Launch in the desktop app, and pinned above the answer list in the browser panel; it remains visible when the list is collapsed. Both buttons control the same session state. Auto play resets OFF when launching a fresh session.

Reload the unpacked extension on `chrome://extensions` or `edge://extensions`, then close the old Krillion tab and launch again. The new panel header must say **PUFFER v2.2 / LIVE**. A new desktop app with an old extension displays an update warning. The package includes the complete updated extension folder.

Gemini now streams completed answer entries before the full JSON response is finished, starts with up to **8 answers**, and scans for category changes faster. Network/model latency and Google quotas still determine response time; no measured live latency is promised. OpenAI uses its existing nonstreaming path.

The list updates as streamed answers, played words, and visible game tiers arrive. **Live top-up: ON** requests another small batch every 18 seconds while the tab is visible and the category is active, with previous suggestions excluded. This can consume additional API quota or credits. Toggle it OFF to keep only the initial batch. Top-ups stop on errors, no new answers, a category change, pause, or a 120-answer cap. Cached suggestions still appear immediately on a repeated category.

Rarity order is **One in a Krillion > Deep Cut > Rare > Schooler > Too Clever > Plankton**. A **GAME** badge means an explicit word/tier pair was read from visible page markup; otherwise **est.** labels the model's estimated tier. Unknown answers are Unrated. Gemini cannot know the game's unrevealed tiers or its editorial top answer, so the app never labels AI output as a verified One in a Krillion. Known tiers are used where exposed by the page, not fetched by probing game answers. No scoring or win guarantee is made.

## Gemini and fast auto play (v2.1)

In **API settings**, select **Gemini**, paste your Google AI Studio key, and Save. The fast default is `gemini-3.5-flash-lite`, with minimal thinking. Only Gemini requests go to Google; OpenAI remains available as a separate provider. Model availability and free quotas depend on your Google project. Your existing OpenAI key cannot be used for Gemini, or vice versa.

The short prompt requests up to 24 established answers, ranked by estimated rarity. It makes no promise of the actual rarest Krillion answer. One request runs per newly detected category; repeated categories use the session cache. Played-word updates do not call the AI. Explicit Retry AI requests can make another call. There is no background prompt-tuning loop or separate ranking request.

After updating, **reload the unpacked extension** on your browser's Extensions page. In the in-page panel, **Slime them out: OFF** toggles automatic typing and submission ON. It starts OFF every page load. It acts only in a visible tab with a detected answer field and an explicit visible your-turn indicator, leaves existing input alone, waits between attempts, and caps attempts at three per observed turn. Click it again or press Escape to stop. Pause stops further attempts. If the page does not expose a recognizable turn indicator, it will not submit automatically. Actual acceptance is tracked from the game; auto play does not assume its submissions were accepted. This cannot guarantee wins and has not been tested in a live round.

Build this version separately with `powershell -NoProfile -ExecutionPolicy Bypass -File .\build.ps1 -ReleaseName release-gemini`.

**Open `PufferHelper.exe`, then click `Launch Krillion`.** After one-time extension setup, the browser reads the category and starts AI suggestions automatically. The old screen rectangles and toggle-heavy UI are replaced with a small launcher and a dark panel in the page.

## One-time setup (Chrome or Edge)

1. Extract the entire ZIP, keeping the `extension` folder beside the EXE.
2. In Chrome open `chrome://extensions`; in Edge open `edge://extensions`.
3. Enable **Developer mode**, click **Load unpacked**, and select the extracted **extension** folder containing `manifest.json`.
4. Use that browser as your Windows default browser, since the launch button opens your default browser.
5. Open the EXE, click **API settings**, choose Gemini or OpenAI, enter that provider's API key locally, and Save. Free limits or API charges apply. Leave Remember unchecked for a session-only key.

The EXE's **Extension setup** button opens an illustrated-style setup page with these instructions. Browser restrictions require the one-time unpacked-extension installation; the EXE does not silently install extensions or change browser settings.

## Each session

Click **Launch Krillion** in the desktop app. Join your game normally. When a question is visible, the extension sends it to the desktop app and generation starts automatically. Keep the desktop app open while playing. Launching again starts a new session and disconnects older launched tabs.

The panel appears near the top right. Drag its header to move it; use **−** to collapse it. Answers are numbered rarest to most common by **AI-estimated general familiarity**, not Krillion's real scoring. Suggestions may be incomplete or rejected by the game.

Click a word to copy it; **✓** marks it used. The app does not enter or submit words into the game. **Pause** stops generation; **Resume** resumes it. **Retry AI** explicitly requests another attempt and may incur another API charge. Identical questions normally use an in-memory cache.

## Played words and categories

The extension reads visible played-answer/history elements and hides matching suggestions. Words remain hidden for the active category even if they disappear from the visible history. A changed question, an available round ID, or leaving the question screen clears the used list. Detection is confirmed over two scans before a category change is applied.

If a new round repeats the exact same question and the page provides no round ID or intervening waiting screen, use **Reset used**. Copying alone does not mark a word as played. **✓** covers a word that automatic detection misses.

**Live page compatibility has not been verified in this development environment.** The reader uses visible DOM elements and question-text detection, tested against representative fixtures. A layout change can require an update. If no question is detected, click **Choose question**, then click the question text once. Escape cancels. Played-answer detection also depends on the page markup and can miss words or mistakenly match unrelated text.

## Privacy and connection

Your API key stays in the desktop app. Only detected question text is sent to the selected provider: Google's Gemini GenerateContent API or OpenAI's Responses API (`store: false` for OpenAI). The extension sends question/played-word text to an authenticated service bound only to `127.0.0.1` on a random port. A fresh session token is passed through the launch URL fragment and removed by the extension. The token is not your API key. No screenshots are required in the new flow.

The extension runs on `krillion.io` and `www.krillion.io`, has session storage for pairing, and loopback host permission for the local bridge. It cannot request arbitrary remote URLs through the bridge. Close the desktop app to stop the connection. Keys can optionally be encrypted for your Windows account; unsupported encrypted storage falls back to the current session. `OPENAI_API_KEY` is supported too.

If the panel does not appear, check that the extension is enabled in the browser opened by Launch Krillion. Keep the EXE open and launch a fresh tab after restarting it. If browser policy blocks local extension requests, this build cannot connect until that policy allows the local bridge.

## Build and checks

`powershell -NoProfile -ExecutionPolicy Bypass -File .\build.ps1` creates `release\PufferHelper.exe` and copies the extension beside it. This leaves a running older EXE undisturbed.

`release\PufferHelper.exe --self-test` checks API request/response handling with a mocked model, authenticated loopback requests, automatic generation, cache reuse, ranking preservation, used-word filtering, round resets, cancellation, and expired sessions. It never calls OpenAI. `node extension\test.cjs` tests representative DOM extraction and extension-worker routing. `--preview` writes a launcher preview PNG. Live AI requires your own key and was not exercised by these checks.

The previous OCR interface remains available with `PufferHelper.exe --legacy` as a fallback.

References: [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts), [extension networking](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests), [OpenAI text generation](https://developers.openai.com/api/docs/guides/text).
