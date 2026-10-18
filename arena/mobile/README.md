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
3. Store listing: short and long text, icon (`store/icon-512.png`), feature graphic, phone screenshots (take them from the game), privacy policy URL `https://vyrebadlands.com/privacy/`.
4. Data safety form: collects a user id (random, for app function), a chosen name (shown to other players); no data sold or shared; no ads; data can be deleted on request by email. Content rating questionnaire: cartoon-style shooter with a blood option.
5. Do not mention tokens, wallets or earning in the listing. The app is a free shooter with play coins.

iPhone (App Store)
The iPhone project is in `ios/` (landscape only, iPhone only, icon and launch picture in place; Capacitor 8 with Swift Package Manager, so there are no pods).
1. App id `com.vyrebadlands.arena` in the Apple developer account (Certificates, Identifiers and Profiles), and the app record in App Store Connect.
2. No Mac needed: the workflow job `ios-store` (run by hand from the Actions tab) signs in the cloud with an App Store Connect key and uploads the build to TestFlight. In App Store Connect: Users and Access, Integrations, App Store Connect API, make a key with the App Manager role. Add four repository secrets: `APPLE_TEAM_ID` (the 10-character team id), `ASC_KEY_ID`, `ASC_ISSUER_ID`, and `ASC_KEY_P8` (the text of the downloaded .p8 file). This path has not been run yet.
3. When the build shows in TestFlight, attach it to version 1.0, answer the export question (standard https only, already declared in the project), and submit for review. External testers need a short beta review.
4. App Privacy answers match the Android data safety answers. Age rating: frequent or intense cartoon violence puts it at 12+ or higher; answer the questionnaire honestly and keep the blood switch.
5. Review note for Apple: no login needed, open the app and press PLAY; matches run on our server; it is a full 3D game with touch controls and bundled assets, not a web page in a frame (Apple rejects those).

## Money rule

The stores take a share of anything sold inside an app and have their own rules for digital items. The app sells nothing: upgrades cost play coins earned in matches. Any real-money purchase waits for the legal review.
