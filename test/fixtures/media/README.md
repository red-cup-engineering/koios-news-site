# Actual audiovisual test recordings

`recordings.json` stores the exact Base64 bytes of two small, synthetic test
recordings. They are test inputs, not reporting or example editorial assets.
The test decodes them into a temporary admitted content root and compares the
published bytes and sealed manifest against their recorded SHA-256s.

The fixtures were made with FFmpeg 6.1.1 using:

```sh
ffmpeg -f lavfi -i sine=frequency=440:sample_rate=16000:duration=0.5 -c:a pcm_s16le tone.wav
ffmpeg -f lavfi -i color=c=blue:s=64x36:r=10:d=0.5 -f lavfi -i sine=frequency=440:sample_rate=48000:duration=0.5 -map 0:v:0 -map 1:a:0 -c:v libx264 -pix_fmt yuv420p -c:a aac -movflags +faststart -shortest tone.mp4
```

Independent `ffprobe -v error -show_streams -show_format -of json` receiving
observed one PCM signed 16-bit little-endian mono audio stream at 16,000 Hz in
the WAV, and one H.264 video stream at 64 × 36 pixels plus one mono AAC audio
stream at 48,000 Hz in the MP4. Both container durations were 0.500000 seconds.
The WAV is 16,078 bytes and the MP4 is 7,140 bytes. Both decoded fully with
`ffmpeg -v error -i <fixture> -f null -`.

Those measurements establish the test inputs, not a new production inspection
capability. FFmpeg/ffprobe is not required to run the ordinary Node test suite
and is not an undeclared production dependency. No duration, codec or dimensions
from this note are injected into the article's public media metadata.
