```markdown
# NeuroTrack Dashboard — Interface Prototype

A static GitHub Pages-ready interface for the NeuroTrack wearable movement-assessment project.

## Included Features

- Patient profile selector with fictional demo profiles
- Body-placement and exercise selectors
- Session timer and progress interface
- Demo report preview
- CSV download functionality
- Responsive layout for desktop and mobile devices

## Important Notice

This is a **front-end interface prototype**. Session measurements, scores, patient profiles, and reports may be simulated in `app.js`, depending on the implemented version.

Do not enter real patient data or use unvalidated scores for clinical decisions.

## Preview Locally

Open `index.html` in a browser. If your browser restricts local scripts or serial communication, run a local static server from the project folder.

```bash
python -m http.server 8000
```

Then open:

http://localhost:8000

## Publish on GitHub Pages

1. Create or open the `NeuroTrackDashboard` repository.
2. Upload `index.html`, `style.css`, `app.js`, and `README.md` to the repository root.
3. Open **Settings → Pages**.
4. Under **Build and deployment**, select **Deploy from a branch**.
5. Select branch `main` and folder `/ (root)`.
6. Click **Save** and wait for deployment to finish.

The expected website URL is:

https://aksalizabraham.github.io/NeuroTrackDashboard/

## Hardware Integration

The NeuroTrack project is intended to work with an ESP32 and an MPU6050 accelerometer/gyroscope sensor. An SSD1306 OLED may also be used to display device information.

Typical I²C connections:

| Component | ESP32 Pin |
|---|---|
| MPU6050 SDA | GPIO 21 |
| MPU6050 SCL | GPIO 22 |
| OLED SDA | GPIO 21 |
| OLED SCL | GPIO 22 |

Verify the wiring, sensor address, firmware, and browser compatibility before testing.

## Using the Dashboard

1. Open the hosted dashboard in desktop Chrome or Edge.
2. Connect the compatible ESP32 hardware if supported by the current application version.
3. Close the Arduino Serial Monitor and Serial Plotter before connecting through Web Serial.
4. Select the body placement and exercise.
5. Start the recording and follow the exercise instructions.
6. Review the resulting measurements and report.
7. Export the session data as CSV.
8. Check the exported file and maintain a separate backup.

**Note:** Hardware communication, actual sensor measurements, and data persistence depend on the implementation currently present in `app.js` and the ESP32 firmware. Do not assume Firebase integration unless it has been implemented and tested.

## Data Management

- Use pseudonymous participant IDs rather than names.
- Export and back up session data after each recording.
- Record the firmware version, sensor placement, exercise, and trial number.
- Do not commit participant data or other sensitive information to a public repository.
- Browser storage may be limited to the current browser and website origin.
- Raw samples held only in memory may be lost when the page is refreshed or closed.

## Engineering Validation

Potential validation checks include:

- Recording duration and sample completeness
- Missing or out-of-order timestamps
- Sensor signal stability
- Repeatability across trials
- Comparison of estimated angles against reference measurements

NeuroTrack is an **engineering prototype**, not a clinically validated medical device. Sensor orientation estimates may be affected by placement, dynamic acceleration, calibration, and movement technique.

The dashboard must not be used to diagnose a medical condition or replace assessment by a qualified healthcare professional.

## Planned Future Improvements

- Improve sensor calibration and angle estimation
- Evaluate signal quality and measurement repeatability
- Compare estimated angles against reference measurements
- Improve session organization and backup workflows
- Add secure data storage and authentication if required
- Conduct further engineering validation before considering clinical applications

## License

A license has not yet been specified. Add an appropriate license if you intend to permit others to reuse or distribute this project.
```
