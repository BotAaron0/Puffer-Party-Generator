# Puffer Party Helper v3.0.0

Made by BotAaron_. Runs entirely in the browser extension.

1. Extract `PufferPartyHelper-Extension.zip`.
2. Open `chrome://extensions` or `edge://extensions` and enable Developer mode.
3. Choose **Load unpacked** and select the folder containing `manifest.json`.
4. Click the extension icon, select Gemini or OpenAI, paste its API key, and click **Launch Puffer Party**.
5. Reload existing Krillion tabs after updating.

Includes rarity sorting, automatic refill, Autofill, variable typing delays, letter-by-letter mode, collapse-to-plus, Grind mode and Retry AI. Played words reset with the active category. GAME tiers come from page evidence; AI tiers are estimates. AI cannot guarantee validity or the rarest possible answer.

Keys stay in session storage by default. Remember key stores it locally in extension storage without additional encryption. Keys are never sent to game pages. Category text and excluded answers go directly to your selected AI provider; provider quotas/billing apply. You will need to enter your key once in this new extension.

Grind mode works in background tabs while the browser and computer remain running. Session keys survive worker suspension and expire when the browser session ends.

Historical desktop source remains in the repository. The EXE is no longer required.

Validation: `node extension/test.cjs` and `node extension/standalone.test.cjs`. Tests use mocked DOM and provider responses; live game/provider verification is separate.
