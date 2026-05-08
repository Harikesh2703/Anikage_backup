const inquirer = require('inquirer');
const chalk = require('chalk');

class Menu {
  /**
   * Prompt for search query
   */
  async promptSearch() {
    const { query } = await inquirer.prompt([
      {
        type: 'input',
        name: 'query',
        message: chalk.cyan('Search anime:'),
        validate: (input) => input.trim().length > 0 || 'Please enter a search query'
      }
    ]);
    return query.trim();
  }
  
  /**
   * Select anime from search results
   */
  async selectAnime(animeList) {
    if (!animeList || animeList.length === 0) {
      return null;
    }
    
    const choices = animeList.map((anime, index) => ({
      name: `${anime.name} (${anime.episodes} episodes)`,
      value: anime,
      short: anime.name
    }));
    
    const { selected } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selected',
        message: 'Select anime:',
        choices,
        pageSize: 15
      }
    ]);
    
    return selected;
  }
  
  /**
   * Select episode(s)
   */
  async selectEpisode(episodes, allowMultiple = false) {
    if (!episodes || episodes.length === 0) {
      return null;
    }
    
    const choices = episodes.map(ep => ({
      name: `Episode ${ep}`,
      value: ep,
      short: ep
    }));
    
    if (allowMultiple) {
      const { selected } = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'selected',
          message: 'Select episode(s):',
          choices,
          pageSize: 15,
          validate: (input) => input.length > 0 || 'Please select at least one episode'
        }
      ]);
      return selected;
    } else {
      const { selected } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selected',
          message: 'Select episode:',
          choices,
          pageSize: 15
        }
      ]);
      return selected;
    }
  }
  
  /**
   * Show playback menu
   */
  async showPlaybackMenu(currentEpisode, title) {
    const { action } = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: `Playing episode ${currentEpisode} of ${title}...`,
        choices: [
          { name: 'Next Episode', value: 'next' },
          { name: 'Replay', value: 'replay' },
          { name: 'Previous Episode', value: 'previous' },
          { name: 'Select Episode', value: 'select' },
          { name: 'Change Quality', value: 'change_quality' },
          { name: 'Quit', value: 'quit' }
        ]
      }
    ]);
    
    return action;
  }
  
  /**
   * Select quality
   */
  async selectQuality(links) {
    if (!links || links.length === 0) {
      return null;
    }
    
    const choices = links.map(link => ({
      name: `${link.quality}`,
      value: link,
      short: link.quality
    }));
    
    const { selected } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selected',
        message: 'Select quality:',
        choices
      }
    ]);
    
    return selected;
  }
  
  /**
   * Select from history
   */
  async selectFromHistory(historyList) {
    if (!historyList || historyList.length === 0) {
      return null;
    }
    
    const choices = historyList.map(item => ({
      name: `${item.title} - Episode ${item.episode}`,
      value: item,
      short: item.title
    }));
    
    const { selected } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selected',
        message: 'Continue watching:',
        choices,
        pageSize: 15
      }
    ]);
    
    return selected;
  }
  
  /**
   * Confirm action
   */
  async confirm(message) {
    const { confirmed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmed',
        message,
        default: false
      }
    ]);
    
    return confirmed;
  }
}

module.exports = new Menu();
