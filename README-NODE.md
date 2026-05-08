# ani-cli (Node.js Version)

A Node.js port of the popular ani-cli bash script. Watch anime from the terminal with ease, now with **native Windows support**!

## Features

✨ **Cross-platform**: Works natively on Windows, macOS, and Linux without WSL or Git Bash  
🎬 **Stream anime**: Browse and watch anime from allmanga.to  
📥 **Download episodes**: Save episodes for offline viewing  
📜 **Watch history**: Continue where you left off  
🎨 **Interactive menus**: Beautiful CLI interface with inquirer  
🎯 **Quality selection**: Choose your preferred video quality  
🌐 **Multiple players**: Support for mpv, VLC, and iina  

## Installation

### Prerequisites

- **Node.js** 14 or higher
- **Video player**: mpv (recommended) or VLC
- **Optional**: aria2c, yt-dlp, ffmpeg (for downloading)

### Install from source

```bash
### Install from source

```bash
# Clone the repository
git clone https://github.com/pystardust/ani-cli.git
cd ani-cli

# Install dependencies
npm install

# Make the script executable
chmod +x bin/ani-cli

# Create symlink for global access (optional)
ln -sf $(pwd)/bin/ani-cli ~/.local/bin/ani-cli

# Or link globally via npm (alternative)
npm link
```
```

### Windows Installation

```powershell
# Install Node.js from https://nodejs.org/

# Install mpv or VLC
# mpv: https://mpv.io/installation/
# VLC: https://www.videolan.org/

# Clone and install
git clone https://github.com/pystardust/ani-cli.git
cd ani-cli
npm install

# Create symlink or add to PATH
# For Windows, you can create a batch file or add the bin directory to PATH
# Or use npm link for global installation
npm link

# Run directly
node bin\ani-cli.js
```

## Usage

### Basic Usage

```bash
# Search and watch anime
ani-cli "one piece"

# Continue from history
ani-cli -c

# Download episode
ani-cli -d "naruto"

# Specify episode
ani-cli -e 5 "attack on titan"

# Episode range
ani-cli -e 1-10 "demon slayer"

# Select quality
ani-cli -q 720 "jujutsu kaisen"

# Use VLC player
ani-cli -v "bleach"

# Watch dubbed version
ani-cli --dub "cowboy bebop"
```

### Command Line Options

```
Options:
  -V, --version              Output the version number
  -c, --continue             Continue watching from history
  -d, --download             Download episode instead of playing
  -D, --delete               Delete history
  -e, --episode <range>      Specify episode number or range
  -q, --quality <quality>    Video quality (best, worst, 360, 480, 720, 1080)
  -v, --vlc                  Use VLC as the media player
  -S, --select-nth <index>   Select nth anime from search results
  --dub                      Play dubbed version
  --player <player>          Specify custom player
  --no-detach                Don't detach the player
  -h, --help                 Display help for command
```

### Environment Variables

```bash
# Set default mode (sub or dub)
export ANI_CLI_MODE=sub

# Set download directory
export ANI_CLI_DOWNLOAD_DIR=~/Downloads/Anime

# Set default quality
export ANI_CLI_QUALITY=1080

# Set default player
export ANI_CLI_PLAYER=mpv

# Disable episode logging
export ANI_CLI_LOG_EPISODE=0
```

## Differences from Bash Version

### Advantages

✅ **Native Windows support** - No WSL or Git Bash required  
✅ **Better error handling** - Clear error messages  
✅ **Modern UI** - Interactive menus with inquirer  
✅ **Easier installation** - Just `npm install`  
✅ **Cross-platform paths** - Automatic path handling  
✅ **Async/await** - Cleaner, more maintainable code  

### Not Yet Implemented

⏳ Syncplay support  
⏳ Rofi integration  
⏳ ani-skip integration  
⏳ Next episode countdown  
⏳ Log viewing  

## Project Structure

```
ani-cli/
├── bin/
│   └── ani-cli.js          # CLI entry point
├── src/
│   ├── index.js            # Main application
│   ├── api/
│   │   └── allanime.js     # API scraping
│   ├── ui/
│   │   └── menu.js         # Interactive menus
│   ├── player/
│   │   └── player.js       # Video player integration
│   ├── download/
│   │   └── downloader.js   # Download functionality
│   ├── history/
│   │   └── history.js      # History management
│   └── utils/
│       ├── config.js       # Configuration
│       └── helpers.js      # Utility functions
└── package.json
```

## Dependencies

- **axios**: HTTP requests
- **chalk**: Terminal colors
- **commander**: CLI argument parsing
- **inquirer**: Interactive prompts
- **cli-progress**: Progress bars
- **ora**: Loading spinners

## Troubleshooting

### Windows Issues

**Player not found:**
```bash
# Add mpv to PATH or use full path
ani-cli-node --player "C:\Program Files\mpv\mpv.exe" "anime name"
```

**Download not working:**
```bash
# Install aria2c or yt-dlp
# aria2: https://github.com/aria2/aria2/releases
# yt-dlp: https://github.com/yt-dlp/yt-dlp/releases
```

### Linux/macOS Issues

**Permission denied:**
```bash
chmod +x bin/ani-cli.js
```

**Player not found:**
```bash
# Install mpv
# Ubuntu/Debian: sudo apt install mpv
# macOS: brew install mpv
# Arch: sudo pacman -S mpv
```

## Contributing

Contributions are welcome! This is a community-driven project.

## License

GNU General Public License v3.0

## Credits

- Original bash script: [pystardust/ani-cli](https://github.com/pystardust/ani-cli)
- Node.js port: Converted from bash to Node.js for better cross-platform support

## Disclaimer

This tool is for educational purposes only. Please support the anime industry by using legal streaming services when possible.
