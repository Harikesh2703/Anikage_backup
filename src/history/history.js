const fs = require('fs');
const config = require('../utils/config');

class History {
  /**
   * Read history file
   */
  readHistory() {
    try {
      const content = fs.readFileSync(config.histFile, 'utf8');
      const lines = content.trim().split('\n').filter(line => line.trim());
      
      return lines.map(line => {
        const parts = line.split('\t');
        if (parts.length >= 3) {
          return {
            episode: parts[0],
            id: parts[1],
            title: parts[2]
          };
        }
        return null;
      }).filter(item => item !== null);
    } catch (error) {
      return [];
    }
  }
  
  /**
   * Update history with current episode
   */
  updateHistory(id, title, episode) {
    const history = this.readHistory();
    
    // Find existing entry
    const existingIndex = history.findIndex(item => item.id === id);
    
    if (existingIndex !== -1) {
      // Update existing entry
      history[existingIndex] = { episode, id, title };
    } else {
      // Add new entry
      history.push({ episode, id, title });
    }
    
    // Write back to file
    this.writeHistory(history);
  }
  
  /**
   * Write history to file
   */
  writeHistory(history) {
    const content = history.map(item => 
      `${item.episode}\t${item.id}\t${item.title}`
    ).join('\n');
    
    fs.writeFileSync(config.histFile, content + '\n', 'utf8');
  }
  
  /**
   * Get next episode for a show
   */
  getNextEpisode(id, episodeList) {
    const history = this.readHistory();
    const entry = history.find(item => item.id === id);
    
    if (!entry) {
      return episodeList[0];
    }
    
    const currentIndex = episodeList.indexOf(entry.episode);
    if (currentIndex === -1 || currentIndex === episodeList.length - 1) {
      return entry.episode;
    }
    
    return episodeList[currentIndex + 1];
  }
  
  /**
   * Clear history
   */
  clearHistory() {
    fs.writeFileSync(config.histFile, '', 'utf8');
  }
  
  /**
   * Get unwatched series from history
   */
  getUnwatchedSeries(episodesListGetter) {
    // This would need to be implemented with async support
    // For now, return the basic history
    return this.readHistory();
  }
}

module.exports = new History();
