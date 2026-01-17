#!/bin/bash
#
# Record Demo GIFs for Ferni Agent Builder
#
# Prerequisites:
#   brew install asciinema
#   npm install -g svg-term-cli
#
# Usage:
#   ./scripts/record-demo-gifs.sh [gif-name]
#   ./scripts/record-demo-gifs.sh              # Interactive menu
#   ./scripts/record-demo-gifs.sh hero         # Record specific GIF
#   ./scripts/record-demo-gifs.sh all          # Record all GIFs
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Directories
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="$PROJECT_ROOT/assets/gifs"

# Create output directory
mkdir -p "$OUTPUT_DIR"

# GIF definitions
declare -A GIFS=(
  ["hero"]="three-commands|15|Hero GIF - init/preview/publish"
  ["wizard"]="wizard|20|Interactive creation wizard"
  ["hotreload"]="hot-reload|12|Edit file, see change instantly"
  ["voice"]="voice-demo|10|Actual voice conversation"
  ["deploy"]="deploy|15|One-click production deploy"
)

# Check prerequisites
check_prerequisites() {
  local missing=()
  
  if ! command -v asciinema &> /dev/null; then
    missing+=("asciinema (brew install asciinema)")
  fi
  
  if ! command -v svg-term &> /dev/null; then
    missing+=("svg-term-cli (npm install -g svg-term-cli)")
  fi
  
  if [ ${#missing[@]} -gt 0 ]; then
    echo -e "${RED}Missing prerequisites:${NC}"
    for dep in "${missing[@]}"; do
      echo -e "  ${YELLOW}•${NC} $dep"
    done
    exit 1
  fi
}

# Print header
print_header() {
  echo ""
  echo -e "${CYAN}╔════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║${NC}    🎬 ${GREEN}Ferni Demo GIF Recorder${NC}         ${CYAN}║${NC}"
  echo -e "${CYAN}╚════════════════════════════════════════╝${NC}"
  echo ""
}

# List available GIFs
list_gifs() {
  echo -e "${BLUE}Available GIFs:${NC}"
  echo ""
  local i=1
  for key in "${!GIFS[@]}"; do
    IFS='|' read -r filename duration description <<< "${GIFS[$key]}"
    local status="○"
    if [ -f "$OUTPUT_DIR/$filename.gif" ]; then
      status="${GREEN}✓${NC}"
    fi
    echo -e "  $status $i. ${CYAN}$key${NC} (${duration}s) - $description"
    ((i++))
  done
  echo ""
}

# Record a single GIF
record_gif() {
  local key=$1
  
  if [ -z "${GIFS[$key]}" ]; then
    echo -e "${RED}Unknown GIF: $key${NC}"
    echo "Available: ${!GIFS[*]}"
    exit 1
  fi
  
  IFS='|' read -r filename duration description <<< "${GIFS[$key]}"
  
  echo -e "${BLUE}Recording: ${CYAN}$key${NC}"
  echo -e "  Filename: $filename.cast"
  echo -e "  Target duration: ${duration}s"
  echo -e "  Description: $description"
  echo ""
  
  # Show script for this GIF
  show_script "$key"
  
  echo ""
  echo -e "${YELLOW}Tips:${NC}"
  echo "  • Type deliberately, not too fast"
  echo "  • Pause after commands complete"
  echo "  • Press Ctrl+D or type 'exit' to stop recording"
  echo ""
  
  read -p "Press Enter to start recording..."
  
  local cast_file="$OUTPUT_DIR/$filename.cast"
  
  echo -e "${RED}🔴 Recording started...${NC}"
  echo ""
  
  # Record with asciinema
  asciinema rec "$cast_file" --overwrite
  
  echo ""
  echo -e "${GREEN}✓ Recording saved to $cast_file${NC}"
  
  # Ask to convert
  read -p "Convert to SVG now? [Y/n] " convert
  if [[ ! $convert =~ ^[Nn]$ ]]; then
    convert_to_svg "$filename"
  fi
}

# Convert .cast to .svg
convert_to_svg() {
  local filename=$1
  local cast_file="$OUTPUT_DIR/$filename.cast"
  local svg_file="$OUTPUT_DIR/$filename.svg"
  
  echo -e "${BLUE}Converting to SVG...${NC}"
  
  svg-term --in "$cast_file" --out "$svg_file" --window --width 80 --height 24
  
  echo -e "${GREEN}✓ SVG saved to $svg_file${NC}"
  echo ""
  echo -e "${YELLOW}To convert SVG to GIF:${NC}"
  echo "  Option 1: https://ezgif.com/svg-to-gif"
  echo "  Option 2: brew install librsvg && rsvg-convert"
  echo "  Option 3: ffmpeg -i $svg_file -vf 'fps=10' $OUTPUT_DIR/$filename.gif"
}

# Show recording script for a GIF
show_script() {
  local key=$1
  
  echo -e "${BLUE}Recording script:${NC}"
  echo -e "${CYAN}─────────────────────────────────────${NC}"
  
  case $key in
    hero)
      cat << 'EOF'
$ npm install -g @ferni/cli
# [wait for install]

$ ferni agent init career-coach
# [pause 1s, wizard appears, press enter through defaults]
✓ Created agent: career-coach

$ ferni agent preview career-coach
# [pause 1s]
🎙️ Preview: http://localhost:3333

$ ferni agent publish career-coach
# [pause 1s]
🚀 Live: https://career-coach.agents.ferni.ai
EOF
      ;;
    wizard)
      cat << 'EOF'
$ ferni agent init my-advisor

# Select: 🎓 Personal Mentor
# Enter name: Alex Rivera  
# Enter tagline: Career Coach for Engineers
# Select voice: 👨 Calm British Man
# Select colors: Ocean - #2980B9

✓ Created: src/personas/bundles/my-advisor/
EOF
      ;;
    hotreload)
      cat << 'EOF'
# Split screen: terminal + editor

$ ferni agent preview my-advisor

🎙️ Preview: http://localhost:3333
   Watching for changes...

# [In editor: change greetings.json]
# "Hey there!" → "Yo! What's up?"

📝 Changed: greetings.json
✓ Reloaded
EOF
      ;;
    deploy)
      cat << 'EOF'
$ ferni agent publish my-advisor

┌  🚀 Publish Agent
│
◇  Validating...
│  ✓ All checks passed
│
◇  Generating landing page...
│  ✓ 98KB
│
◇  Deploying to Cloud Run...
│  ████████████████████ 100%
│  ✓ Deployed
│
│  🌐 https://my-advisor.agents.ferni.ai
│
└  Live! 🎉
EOF
      ;;
    voice)
      cat << 'EOF'
# Screen recording of preview page at localhost:3333

[Click microphone button]
[User speaks] "Hey, I need help with my resume"
[Waveform animates]
[Agent responds] "Sure! Tell me about the role you're applying for."
[Natural back-and-forth continues]
EOF
      ;;
  esac
  
  echo -e "${CYAN}─────────────────────────────────────${NC}"
}

# Interactive menu
interactive_menu() {
  while true; do
    print_header
    list_gifs
    
    echo -e "${BLUE}Options:${NC}"
    echo "  1-5. Record specific GIF"
    echo "  a.   Record all GIFs"
    echo "  c.   Convert existing .cast files"
    echo "  q.   Quit"
    echo ""
    
    read -p "Choice: " choice
    
    case $choice in
      1) record_gif "hero" ;;
      2) record_gif "wizard" ;;
      3) record_gif "hotreload" ;;
      4) record_gif "voice" ;;
      5) record_gif "deploy" ;;
      a|A)
        for key in hero wizard hotreload deploy; do
          record_gif "$key"
        done
        ;;
      c|C)
        echo ""
        echo -e "${BLUE}Available .cast files:${NC}"
        ls -1 "$OUTPUT_DIR"/*.cast 2>/dev/null || echo "  (none)"
        echo ""
        read -p "Filename (without extension): " fname
        if [ -f "$OUTPUT_DIR/$fname.cast" ]; then
          convert_to_svg "$fname"
        else
          echo -e "${RED}File not found${NC}"
        fi
        ;;
      q|Q)
        echo ""
        echo -e "${GREEN}Happy recording! 🎬${NC}"
        exit 0
        ;;
      *)
        echo -e "${RED}Invalid choice${NC}"
        ;;
    esac
    
    echo ""
    read -p "Press Enter to continue..."
  done
}

# Main
main() {
  check_prerequisites
  
  local gif_name=${1:-}
  
  if [ -z "$gif_name" ]; then
    interactive_menu
  elif [ "$gif_name" = "all" ]; then
    print_header
    for key in hero wizard hotreload deploy; do
      record_gif "$key"
    done
  else
    print_header
    record_gif "$gif_name"
  fi
}

main "$@"
