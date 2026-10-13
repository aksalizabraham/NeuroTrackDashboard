# NeuroTrack — Wearable Motion Assessment Dashboard

**NeuroTrack** is a biomedical engineering prototype that combines wearable inertial sensing with a browser-based dashboard to record and review wrist movement during structured assessment exercises.

The project explores motion capture, wrist-angle estimation, repetition tracking, signal visualization, and data export for engineering evaluation.

## Live Demo

**Dashboard:** https://aksalizabraham.github.io/NeuroTrackDashboard/

**Repository:** https://github.com/aksalizabraham/NeuroTrackDashboard

The dashboard is hosted using GitHub Pages. Hardware communication uses the browser's Web Serial API.

## Project Objectives

- Capture accelerometer and gyroscope measurements from a wearable motion sensor.
- Record movement during predefined wrist exercises.
- Estimate and visualize changes in wrist orientation.
- Review session results and movement patterns.
- Export recorded data for further analysis and engineering validation.

## Assessment Exercises

The wrist assessment workflow includes three exercises:

1. **Resting Tremor Assessment** — Record wrist movement while the participant attempts to keep the wrist relaxed and still.
2. **Postural Tremor Assessment** — Record movement while the participant maintains a specified wrist posture.
3. **Wrist Flexion–Extension Assessment** — Record wrist movement during repeated flexion and extension.

Each exercise is intended to be performed using a consistent setup and recording procedure.

## Hardware

- ESP32 development board
- MPU6050 accelerometer and gyroscope module
- SSD1306 OLED display, if using the display-enabled firmware
- USB cable for power, serial communication, and programming
- Breadboard and jumper wires, as required

### Typical I²C Connections

| Component | ESP32 connection |
|---|---|
| MPU6050 SDA | GPIO 21 |
| MPU6050 SCL | GPIO 22 |
| OLED SDA | GPIO 21 |
| OLED SCL | GPIO 22 |
| Sensor/OLED power and ground | Connect according to module specifications |

The MPU6050 and OLED can share the I²C bus when their addresses are different. Verify the actual sensor address and wiring on your hardware before use.

## Software and Technologies

- HTML
- CSS
- JavaScript
- Web Serial API
- GitHub Pages
- Arduino IDE and ESP32 firmware
- CSV data export

## How to Use the Dashboard

1. Open the [hosted dashboard](https://aksalizabraham.github.io/NeuroTrackDashboard/) using desktop Google Chrome or Microsoft Edge.
2. Connect the ESP32 and motion sensor according to the hardware wiring.
3. Upload the compatible NeuroTrack firmware to the ESP32.
4. Close the Arduino Serial Monitor and Serial Plotter.
5. Connect the device through the dashboard's serial connection control and select the appropriate serial port.
6. Select the wrist exercise.
7. Position the sensor consistently and follow the exercise instructions.
8. Complete the recording and review the available measurements and visualizations.
9. Export the session data as CSV and keep the file for subsequent analysis.

If serial communication does not work, check the USB connection, selected COM port, firmware compatibility, browser permissions, and whether another application is using the serial port.

## Data Management

- Export session data after each recording.
- Use pseudonymous participant IDs rather than names in filenames.
- Keep a separate backup of exported CSV files and the firmware version used.
- Browser-local history, if enabled, is not a substitute for exporting session data.
- Raw samples held only in memory may be lost when the page is refreshed or closed.
- Data stored on the local website origin may not be available on a different origin or browser.

Example filename:

`NT_P01_Wrist_Postural_Trial01_2026-10-14.csv`

Do not put identifiable participant information into public repositories or commit participant data to GitHub.

## Engineering Validation

Before interpreting measurements, evaluate the prototype's technical performance through repeated recordings and, where available, comparison with an appropriate reference measurement.

Useful engineering checks include:

- Recording duration and sample completeness
- Missing, duplicate, or out-of-order timestamps
- Sensor signal stability and obvious outliers
- Repeatability across trials
- Difference between the device's estimated angle and a reference angle measurement

Document the sensor placement, exercise instructions, firmware version, and any changes in the test setup.

## Limitations and Intended Use

NeuroTrack is an **engineering and research prototype**, not a clinically validated medical device.

Accelerometer-based orientation estimates can be affected by sensor placement, dynamic acceleration, and movement outside the assumed measurement plane. Repetition counts and motion metrics may require further calibration and validation.

The dashboard does not establish a diagnosis, measure disease severity, or replace assessment by a qualified healthcare professional. Any scores or metrics should be interpreted only within the limits of the implemented algorithms and the validation evidence available.

## Future Work

- Improve sensor calibration and angle-estimation accuracy.
- Evaluate signal quality and repeatability.
- Compare device measurements against reference measurements.
- Improve session organization and data management.
- Conduct more extensive validation before considering clinical use.

## License

Add a license to this repository if you intend to distribute or reuse the project publicly. Until a license is specified, the repository's reuse permissions may be limited.
