param([switch]$AllowPartial)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$words = @()
foreach ($part in @('1-2-preserved','3-16','17-30','31-44','45-60')) {
  $file = Join-Path $root ('data/english-days-' + $part + '.json')
  $words += @(Get-Content -LiteralPath $file -Raw -Encoding UTF8 | ConvertFrom-Json)
}
$days = @($words.day | Sort-Object -Unique)
if (!$AllowPartial -and $days.Count -ne 60) { throw 'Full 60-day data is not ready. Refusing partial generation.' }
$ffmpeg = (Get-Command ffmpeg -ErrorAction Stop).Source
Add-Type -AssemblyName System.Speech
$speech = New-Object System.Speech.Synthesis.SpeechSynthesizer
$speech.SelectVoice('Microsoft Zira Desktop')
$speech.Rate = -2
$tmp = Join-Path ([IO.Path]::GetTempPath()) ('english-audio-' + [Guid]::NewGuid().ToString() + '.wav')
$items = @()
$previous = @{}
$manifestPath = Join-Path $root 'data/english-full-audio-manifest.json'
if (Test-Path -LiteralPath $manifestPath) {
  foreach ($entry in ((Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json).items)) { $previous[$entry.id] = $entry.spoken }
}
try {
  foreach ($word in $words) {
    if ($word.id -notmatch '^d\d+-[a-z0-9-]+$') { throw "Invalid word id: $($word.id)" }
    $group = [int][Math]::Ceiling($word.day / 6.0)
    $package = 'pkg-english-audio-{0:00}' -f $group
    $folder = Join-Path $root ('miniapp/src/' + $package + '/static')
    New-Item -ItemType Directory -Force -Path $folder | Out-Null
    $dest = Join-Path $folder ($word.id + '.mp3')
    # Speak placeholders as words, rather than ambiguous letter sequences.
    $spoken = [string]$word.english
    $spoken = $spoken -replace '\bsb\.', 'somebody' -replace '\bsth\.', 'something' -replace '…', ' '
    $spoken = $spoken -replace '\s*/\s*', ' or '
    # Regenerate missing recordings or words whose spoken text changed since the last run.
    if (!(Test-Path -LiteralPath $dest) -or !$previous.ContainsKey($word.id) -or $previous[$word.id] -ne $spoken) {
      $speech.SetOutputToWaveFile($tmp)
      $speech.Speak($spoken)
      $speech.SetOutputToNull()
      & $ffmpeg -hide_banner -loglevel error -y -i $tmp -ac 1 -ar 22050 -b:a 24k $dest
      if ($LASTEXITCODE -ne 0) { throw "Audio encoding failed: $($word.id)" }
    }
    $items += [ordered]@{id=$word.id; day=$word.day; spoken=$spoken; path=($package + '/static/' + $word.id + '.mp3'); bytes=(Get-Item -LiteralPath $dest).Length}
    if ($items.Count % 100 -eq 0) { Write-Output "Generated/verified $($items.Count)/$($words.Count)" }
  }
} finally {
  $speech.Dispose()
  # Only this invocation's exact generated temporary file is removed.
  if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp }
}
$manifest = [ordered]@{voice='Microsoft Zira Desktop';locale='en-US';synthetic=$true;bitrate='24kbps';sampleRate=22050;items=$items}
$manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $root 'data/english-full-audio-manifest.json') -Encoding UTF8
foreach ($g in ($items | Group-Object {($_.path -split '/')[0]})) {
  $size = 0
  foreach ($entry in $g.Group) { $size += [long]$entry.bytes }
  Write-Output "$($g.Name): $($g.Count) files, $size bytes"
  if ($size -ge 1900000) { throw "Audio package $($g.Name) needs splitting: $size bytes" }
}
Write-Output "Completed $($items.Count) files. Run check-english-packages.py on each built output."
