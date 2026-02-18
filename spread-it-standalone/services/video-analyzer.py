import sys
import json
from pathlib import Path

# Exemple simple : analyse de durée vidéo
import subprocess

def analyze_video(video_path):
    """Analyser vidéo avec ffprobe"""
    try:
        result = subprocess.run(
            ['ffprobe', '-v', 'error', '-show_format', '-show_streams', 
             '-print_json', video_path],
            capture_output=True, text=True, timeout=10
        )
        data = json.loads(result.stdout)
        duration = float(data['format']['duration'])
        
        return {
            'success': True,
            'duration': duration,
            'is_simulation': False,
            'safety': 'safe'
        }
    except Exception as e:
        return {
            'success': False,
            'error': str(e),
            'is_simulation': True,
            'safety': 'unknown'
        }

if __name__ == '__main__':
    video_path = sys.argv[1] if len(sys.argv) > 1 else None
    if not video_path:
        print(json.dumps({'error': 'No video path provided'}))
        sys.exit(1)
    
    result = analyze_video(video_path)
    print(json.dumps(result))
