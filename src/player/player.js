const { spawn } = require('child_process');
const os = require('os');
const config = require('../utils/config');
const helpers = require('../utils/helpers');

class Player {
  constructor() {
    this.playerFunction = config.playerFunction;
  }
  
  /**
   * Play video with the configured player
   */
  async play(videoUrl, title, episode, options = {}) {
    return new Promise((resolve, reject) => {
      helpers.info(`Playing episode ${episode}...`);
      helpers.info(`Opening in browser: ${videoUrl}`);

      const { execSync } = require('child_process');
      const platform = os.platform();

      let openCmd;
      if (platform === 'win32') {
        // Windows: escape & chars in URL for cmd.exe
        const safeUrl = videoUrl.replace(/&/g, '^&');
        openCmd = `start "" "${safeUrl}"`;
      } else if (platform === 'darwin') {
        openCmd = `open "${videoUrl}"`;
      } else {
        // Linux / BSD
        openCmd = `xdg-open "${videoUrl}"`;
      }

      try {
        execSync(openCmd, { stdio: 'ignore', env: process.env, shell: true });
        setTimeout(() => resolve(0), 500);
      } catch (error) {
        console.error(`Failed to open browser: ${error.message}`);
        reject(error);
      }
    });
  }

  _legacyPlay(videoUrl, title, episode, options = {}) {
    const { subtitle, referer, noDetach } = options;
    
    return new Promise((resolve, reject) => {
      const args = this.buildPlayerArgs(videoUrl, title, episode, { subtitle, referer });
      
      helpers.info(`Playing episode ${episode}...`);
      
      if (this.playerFunction === 'debug') {
        console.log('Video URL:', videoUrl);
        console.log('Title:', title);
        console.log('Episode:', episode);
        console.log('Args:', args);
        resolve(0);
        return;
      }
      
      try {
        const { execSync } = require('child_process');
        execSync('which mpv || which vlc', { stdio: 'ignore' });
      } catch (e) {
        console.error("\\nDEBUG: Warning: Neither mpv nor vlc found in PATH.");
      }
      
      const fullCommand = `${this.playerFunction} ${args.join(' ')}`;
      console.log("\\nDEBUG: Running Command ->", fullCommand);
      
      const playerProcess = spawn(this.playerFunction, args, {
        detached: !noDetach && !config.noDetach,
        stdio: noDetach || config.noDetach ? 'inherit' : 'ignore',
        env: process.env
      });
      
      playerProcess.on('error', (error) => {
        console.error(`\\nDEBUG: Player Execution Error -> ${error.message}`);
        reject(new Error(`Failed to start player: ${error.message}`));
      });
      
      if (!noDetach && !config.noDetach) {
        playerProcess.unref();
        setTimeout(() => resolve(0), 100);
      } else {
        playerProcess.on('close', (code) => {
          resolve(code || 0);
        });
      }
    });
  }
  
  /**
   * Build player arguments based on player type
   */
  buildPlayerArgs(videoUrl, title, episode, options = {}) {
    const { subtitle, referer } = options;
    const mediaTitle = `${title} - Episode ${episode}`;
    const args = [];
    
    const playerName = this.playerFunction.toLowerCase();
    
    if (playerName.includes('mpv')) {
      args.push(`--force-media-title=${mediaTitle}`);
      
      if (subtitle) {
        args.push(`--sub-file=${subtitle}`);
      }
      
      if (referer) {
        args.push(`--referrer=${referer}`);
      }
      
      args.push(videoUrl);
    } else if (playerName.includes('vlc')) {
      if (referer) {
        args.push(`--http-referrer=${referer}`);
      }
      
      args.push('--play-and-exit');
      args.push(`--meta-title=${mediaTitle}`);
      args.push(videoUrl);
    } else if (playerName.includes('iina')) {
      args.push('--no-stdin');
      args.push(`--mpv-force-media-title=${mediaTitle}`);
      
      if (subtitle) {
        args.push(`--mpv-sub-file=${subtitle}`);
      }
      
      if (referer) {
        args.push(`--mpv-referrer=${referer}`);
      }
      
      // Check if IINA is already running
      const isRunning = this.checkIfProcessRunning('IINA');
      if (!isRunning) {
        args.push('--keep-running');
      }
      
      args.push(videoUrl);
    } else {
      // Generic player
      args.push(videoUrl);
    }
    
    return args;
  }
  
  /**
   * Check if a process is running (macOS/Linux)
   */
  checkIfProcessRunning(processName) {
    try {
      const platform = os.platform();
      if (platform === 'darwin' || platform === 'linux') {
        const { execSync } = require('child_process');
        execSync(`pgrep -f "${processName}"`, { stdio: 'ignore' });
        return true;
      }
    } catch (error) {
      return false;
    }
    return false;
  }
  
  /**
   * Set player
   */
  setPlayer(player) {
    this.playerFunction = player;
  }
  
  /**
   * Get current player
   */
  getPlayer() {
    return this.playerFunction;
  }
}

module.exports = new Player();
