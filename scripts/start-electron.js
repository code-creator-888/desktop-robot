const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function getElectronPlatformPath() {
  switch (process.platform) {
    case 'darwin':
      return 'Electron.app/Contents/MacOS/Electron';
    case 'linux':
    case 'freebsd':
    case 'openbsd':
      return 'electron';
    case 'win32':
      return 'electron.exe';
    default:
      throw new Error(`Unsupported platform: ${process.platform}`);
  }
}

function ensureElectronPathFile() {
  const electronDir = path.join(__dirname, '..', 'node_modules', 'electron');
  const pathFile = path.join(electronDir, 'path.txt');
  if (fs.existsSync(pathFile)) {
    return;
  }

  const platformPath = getElectronPlatformPath();
  const bundledExecutable = path.join(electronDir, 'dist', platformPath);
  if (!fs.existsSync(bundledExecutable)) {
    throw new Error('Electron binary is missing. Run npm install to restore dependencies.');
  }

  fs.writeFileSync(pathFile, platformPath);
}

function start() {
  ensureElectronPathFile();

  const electronBinary = require('electron');
  const child = spawn(electronBinary, [path.join(__dirname, '..')], {
    stdio: 'inherit'
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });
}

start();
