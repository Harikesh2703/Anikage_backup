const os = require('os');
const path = require('path');
const fs = require('fs');

class Config {
  constructor() {
    this.version = '4.10.4';
    this.agent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0';
    this.allanimeRefr = 'https://allmanga.to';
    this.allanimeBase = 'allanime.day';
    this.allanimeApi = `https://api.${this.allanimeBase}`;
    
    // Environment variables
    this.mode = process.env.ANI_CLI_MODE || 'sub';
    this.downloadDir = process.env.ANI_CLI_DOWNLOAD_DIR || '.';
    this.logEpisode = process.env.ANI_CLI_LOG_EPISODE !== '0';
    this.quality = process.env.ANI_CLI_QUALITY || 'best';
    this.skipIntro = process.env.ANI_CLI_SKIP_INTRO === '1';
    this.noDetach = process.env.ANI_CLI_NO_DETACH === '1';
    this.skipTitle = process.env.ANI_CLI_SKIP_TITLE || '';
    
    // History directory
    const stateHome = process.env.XDG_STATE_HOME || path.join(os.homedir(), '.local', 'state');
    this.histDir = process.env.ANI_CLI_HIST_DIR || path.join(stateHome, 'ani-cli');
    this.histFile = path.join(this.histDir, 'ani-hsts');
    
    // Ensure history directory exists
    this.ensureHistoryDir();
    
    // Player function based on platform
    this.playerFunction = this.getDefaultPlayer();
  }
  
  ensureHistoryDir() {
    if (!fs.existsSync(this.histDir)) {
      fs.mkdirSync(this.histDir, { recursive: true });
    }
    if (!fs.existsSync(this.histFile)) {
      fs.writeFileSync(this.histFile, '');
    }
  }
  
  getDefaultPlayer() {
    if (process.env.ANI_CLI_PLAYER) {
      return process.env.ANI_CLI_PLAYER;
    }
    
    const platform = os.platform();
    
    switch (platform) {
      case 'darwin':
        return 'iina';
      case 'win32':
        return 'mpv.exe';
      case 'linux':
        return 'mpv';
      default:
        return 'mpv';
    }
  }
}

module.exports = new Config();
