# EngineLab – Windows Desktop App (.exe)

## Requirements
- Windows 10/11
- Node.js 20 or newer (https://nodejs.org)

## Build the .exe
Open **Command Prompt** or **PowerShell** in the project folder and run:

```
npm install
npm run build:exe
```

When it finishes, open the `release` folder:
- `EngineLab Setup x.y.z.exe` – installer
- `EngineLab x.y.z.exe` – portable version (no install needed)

The app runs fully offline. Your files never leave your computer.

## Try it without building
```
npm run electron:dev
```
This starts the app in a desktop window with live reload.

## Troubleshooting
- **Blank window**: delete the `dist` folder and run `npm run build:exe` again.
- **Windows SmartScreen warning**: the exe is unsigned. Click "More info" → "Run anyway".
