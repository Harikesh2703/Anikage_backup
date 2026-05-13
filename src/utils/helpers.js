const chalk = require('chalk');

class Helpers {
  /**
   * Print error message and exit
   */
  die(message) {
    console.error(chalk.red.bold(message));
    throw new Error(message);
  }
  
  /**
   * Print info message
   */
  info(message) {
    console.log(chalk.blue.bold(message));
  }
  
  /**
   * Print success message
   */
  success(message) {
    console.log(chalk.green.bold(message));
  }
  
  /**
   * Clear current line
   */
  clearLine() {
    process.stdout.write('\r\x1b[K');
  }
  
  /**
   * Decode provider ID (hex to string conversion from bash script)
   */
  decodeProviderId(hexString) {
    const mapping = {
      '79': 'A', '7a': 'B', '7b': 'C', '7c': 'D', '7d': 'E', '7e': 'F', '7f': 'G',
      '70': 'H', '71': 'I', '72': 'J', '73': 'K', '74': 'L', '75': 'M', '76': 'N', '77': 'O',
      '68': 'P', '69': 'Q', '6a': 'R', '6b': 'S', '6c': 'T', '6d': 'U', '6e': 'V', '6f': 'W',
      '60': 'X', '61': 'Y', '62': 'Z',
      '59': 'a', '5a': 'b', '5b': 'c', '5c': 'd', '5d': 'e', '5e': 'f', '5f': 'g',
      '50': 'h', '51': 'i', '52': 'j', '53': 'k', '54': 'l', '55': 'm', '56': 'n', '57': 'o',
      '48': 'p', '49': 'q', '4a': 'r', '4b': 's', '4c': 't', '4d': 'u', '4e': 'v', '4f': 'w',
      '40': 'x', '41': 'y', '42': 'z',
      '08': '0', '09': '1', '0a': '2', '0b': '3', '0c': '4', '0d': '5', '0e': '6', '0f': '7',
      '00': '8', '01': '9',
      '15': '-', '16': '.', '67': '_', '46': '~', '02': ':', '17': '/', '07': '?',
      '1b': '#', '63': '[', '65': ']', '78': '@', '19': '!', '1c': '$', '1e': '&',
      '10': '(', '11': ')', '12': '*', '13': '+', '14': ',', '03': ';', '05': '=', '1d': '%'
    };
    
    let result = '';
    for (let i = 0; i < hexString.length; i += 2) {
      const hex = hexString.substr(i, 2);
      result += mapping[hex] || '';
    }
    
    return result.replace('/clock', '/clock.json');
  }
  
  /**
   * Parse episode range
   */
  parseEpisodeRange(input, episodeList) {
    if (!input) return null;
    
    // Handle single episode
    if (!input.includes('-') && !input.includes(' ')) {
      return [input];
    }
    
    // Handle range (e.g., "1-5")
    const rangeParts = input.split(/[-\s]+/);
    if (rangeParts.length === 2) {
      const start = rangeParts[0] === '-1' ? episodeList[episodeList.length - 1] : rangeParts[0];
      const end = rangeParts[1] === '-1' ? episodeList[episodeList.length - 1] : rangeParts[1];
      
      const startIdx = episodeList.indexOf(start);
      const endIdx = episodeList.indexOf(end);
      
      if (startIdx === -1 || endIdx === -1) return null;
      
      return episodeList.slice(startIdx, endIdx + 1);
    }
    
    // Handle space-separated episodes
    return input.split(/\s+/);
  }
  
  /**
   * Sanitize filename
   */
  sanitizeFilename(filename) {
    return filename.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, ' ').trim();
  }
}

module.exports = new Helpers();
