# NeuroTrack Dashboard — interface prototype

A static GitHub Pages-ready interface for the NeuroTrack wearable movement-assessment project.

## Included
- Patient profile selector (fictional demo profiles)
- Body-placement and exercise selectors
- Session timer and progress UI
- Demo report preview and CSV download
- Responsive layout for desktop and mobile

## Important
This is a **front-end demo only**. Session measurements, scores, patient profiles and reports are simulated in `app.js`. It does not connect to the ESP32 or Firebase yet. Do not enter real patient data or use the scores for clinical decisions.

## Preview locally
Open `index.html` in a browser. If your browser restricts local scripts, run a local static server from this folder, for example with Python:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Publish on GitHub Pages
1. Create a new repository named `NeuroTrackDashboard` (recommended, so the existing NeuroClipDashboard stays unchanged).
2. Upload `index.html`, `style.css`, `app.js`, and `README.md` to the repository root.
3. Open **Settings → Pages**.
4. Under Build and deployment, choose **Deploy from a branch**, branch `main`, folder `/ (root)`, and save.
5. Wait for the Pages deployment. The site URL will be `https://YOUR-GITHUB-USERNAME.github.io/NeuroTrackDashboard/`.

## Next integration stage
Replace demo-only behavior with:
1. Firebase Authentication and security rules.
2. A device command path that stores a unique session/command ID, patient ID, placement, exercise ID and duration.
3. ESP32 polling or a realtime listener for commands.
4. Device upload of raw samples or calculated features and session status.
5. Server-side or browser-side analysis of real measurements and reports based only on measured data.

Do not make Firebase publicly readable/writable for convenience. Restrict patient records to authorized users.
