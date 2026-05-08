#!/usr/bin/env node

const { program } = require('commander');
const AniCli = require('../src/index');
const config = require('../src/utils/config');

program
  .name('ani-cli')
  .description('A Node.js CLI to browse and watch anime from the terminal')
  .version(config.version)
  .argument('[query...]', 'Search query for anime')
  .option('-c, --continue', 'Continue watching from history')
  .option('-d, --download', 'Download episode instead of playing')
  .option('-D, --delete', 'Delete history')
  .option('-e, --episode <range>', 'Specify episode number or range (e.g., "5" or "1-10")')
  .option('-q, --quality <quality>', 'Video quality (best, worst, 360, 480, 720, 1080)', 'best')
  .option('-v, --vlc', 'Use VLC as the media player')
  .option('-S, --select-nth <index>', 'Select nth anime from search results', parseInt)
  .option('--dub', 'Play dubbed version')
  .option('--player <player>', 'Specify custom player')
  .option('--no-detach', 'Don\'t detach the player')
  .action(async (query, options) => {
    try {
      const aniCli = new AniCli({
        query: query.join(' '),
        ...options
      });
      
      await aniCli.run();
    } catch (error) {
      if (error.message !== 'User cancelled') {
        console.error(error.message);
        process.exit(1);
      }
    }
  });

program.parse();
