# Puffer Companion v2

**Open `PufferHelper.exe`, then click `Launch Krillion`.** After one-time extension setup, the browser reads the category and starts AI suggestions automatically. The old screen rectangles and toggle-heavy UI are replaced with a small launcher and a dark panel in the page.

## One-time setup (Chrome or Edge)

1. Extract the entire ZIP, keeping the `extension` folder beside the EXE.
2. In Chrome open `chrome://extensions`; in Edge open `edge://extensions`.
3. Enable **Developer mode**, click **Load unpacked**, and select the extracted **extension** folder containing `manifest.json`.
4. Use that browser as your Windows default browser, since the launch button opens your default browser.
5. Open the EXE, click **API settings**, enter your OpenAI API key locally, and Save. API usage may incur charges. Leave Remember unchecked for a session-only key.

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

The OpenAI key stays in the desktop app. Only detected question text is sent to OpenAI's Responses API, with `store: false`. The extension sends question/played-word text to an authenticated service bound only to `127.0.0.1` on a random port. A fresh session token is passed through the launch URL fragment and removed by the extension. The token is not your API key. No screenshots are required in the new flow.

The extension runs on `krillion.io` and `www.krillion.io`, has session storage for pairing, and loopback host permission for the local bridge. It cannot request arbitrary remote URLs through the bridge. Close the desktop app to stop the connection. Keys can optionally be encrypted for your Windows account; unsupported encrypted storage falls back to the current session. `OPENAI_API_KEY` is supported too.

If the panel does not appear, check that the extension is enabled in the browser opened by Launch Krillion. Keep the EXE open and launch a fresh tab after restarting it. If browser policy blocks local extension requests, this build cannot connect until that policy allows the local bridge.

## Build and checks

`powershell -NoProfile -ExecutionPolicy Bypass -File .\build.ps1` creates `release\PufferHelper.exe` and copies the extension beside it. This leaves a running older EXE undisturbed.

`release\PufferHelper.exe --self-test` checks API request/response handling with a mocked model, authenticated loopback requests, automatic generation, cache reuse, ranking preservation, used-word filtering, round resets, cancellation, and expired sessions. It never calls OpenAI. `node extension\test.cjs` tests representative DOM extraction and extension-worker routing. `--preview` writes a launcher preview PNG. Live AI requires your own key and was not exercised by these checks.

The previous OCR interface remains available with `PufferHelper.exe --legacy` as a fallback.

References: [Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts), [extension networking](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests), [OpenAI text generation](https://developers.openai.com/api/docs/guides/text).
