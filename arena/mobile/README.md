# Vyre Bad Lands: phone apps (Android and iPhone)

The game page, wrapped as a store app with Capacitor. The app carries the light set of models, textures and skies (about 32 MB of web files) and talks to the public match server (`https://play.vyrebadlands.com`), so a phone never needs the desktop files. It opens sideways and full screen and keeps the screen awake. Play money only: nothing in the app takes payment or touches a wallet.

## Build

```
npm ci --prefix ../web && npm ci
npm run build:web          # the page for the apps, into ./www (GAME_SERVER=... to point at another server)
npx cap sync               # copies it into android/ (and ios/ when that exists)
cd android && ./gradlew assembleDebug     # app/build/outputs/apk/debug/app-debug.apk, installable on any Android phone
```

Needs JDK 21 and the Android SDK (platform 36). The workflow `.github/workflows/mobile.yml` builds the same on GitHub: the debug APK appears as a download on each run, the iPhone project is compile-checked on a Mac runner.

## Store submission checklist

Needs the owner: the store accounts, the final app id (`com.vyrebadlands.arena` is a placeholder), the contact email, screenshots.

Android (Google Play)
1. New app in the Play Console, package `com.vyrebadlands.arena`. Let Play manage the app signing key; make an upload key (keytool), keep it safe, and add it to the repository secrets as `ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, then set the repository variable `ANDROID_SIGNING` to `on`. The workflow then builds a signed `.aab`.
2. Upload the bundle to a closed testing track first. A personal developer account created after November 2023 must run a closed test with 12 testers for 14 days before it can publish; an organisation account does not.
3. Store listing: short and long text, icon (`web/public/icon-512.png`), feature graphic, phone screenshots (take them from the game), privacy policy URL `https://vyrebadlands.com/privacy/`.
4. Data safety form: collects a user id (random, for app function), a chosen name (shown to other players); no data sold or shared; no ads; data can be deleted on request by email. Content rating questionnaire: cartoon-style shooter with a blood option.
5. Do not mention tokens, wallets or earning in the listing. The app is a free shooter with play coins.

iPhone (App Store)
1. App id in the Apple developer account, then a Mac (or a cloud Mac service) runs `npx cap add ios`, `npx cap sync ios`, sets the team and signing, archives and uploads to TestFlight. The workflow only checks that it compiles.
2. Test with TestFlight (external testers need a short beta review).
3. App Privacy answers match the Android data safety answers. Age rating: frequent or intense cartoon violence puts it at 12+ or higher; answer the questionnaire honestly and keep the blood switch.
4. Review note for Apple: no login needed, open the app and press PLAY; explain that matches run on our server and the app is more than a website because it is a full 3D game with touch controls.
5. Apple rejects apps that are only a website in a frame; this one is a full 3D game with its own touch controls and bundled assets. Keep it that way.

## Money rule

The stores take a share of anything sold inside an app and have their own rules for digital items. The app sells nothing: upgrades cost play coins earned in matches. Any real-money purchase waits for the legal review.
