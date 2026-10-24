# Synthesize one narration take per beat with a built-in Windows voice (free, offline).
# Usage: powershell -File explainer/narrate.ps1
# To use your own recording or a paid voice instead, put beat_01.wav .. beat_10.wav in explainer/out/voice/
# and skip this script; everything downstream measures the files it finds.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$cfg = Get-Content -Raw -Encoding UTF8 (Join-Path $PSScriptRoot 'beats.json') | ConvertFrom-Json
$out = Join-Path $root 'explainer\out\voice'
New-Item -ItemType Directory -Force $out | Out-Null
Add-Type -AssemblyName System.Speech
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(44100, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
foreach ($b in $cfg.beats) {
  $s = New-Object System.Speech.Synthesis.SpeechSynthesizer
  $s.SelectVoice($cfg.voice.name); $s.Rate = [int]$cfg.voice.rate
  $f = Join-Path $out ('beat_{0:D2}.wav' -f [int]$b.id)
  $s.SetOutputToWaveFile($f, $fmt)
  if ($b.ssml) {   # optional per-beat pronunciation fix: SSML body, e.g. a short break inside a name
    $s.SpeakSsml('<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">' + [string]$b.ssml + '</speak>')
  } else { $s.Speak([string]$b.line) }
  $s.Dispose()
  Write-Output ('{0}  {1}' -f (Split-Path -Leaf $f), $b.line)
}
