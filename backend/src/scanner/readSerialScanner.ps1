# Читает коды со сканера, работающего в режиме USB COM (виртуальный последовательный порт),
# и пишет в stdout строки протокола для backend:
#   PORT <имя>    — порт открыт, сканер готов
#   SCAN <код>    — считан код
#   WAIT <текст>  — порт не найден / занят, повтор позже
# Работает через System.IO.Ports из .NET — без npm-пакетов и нативной сборки.
param(
  [string]$PortName = 'auto',
  [int]$BaudRate = 9600,
  [int]$ParentPid = 0
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Send([string]$line) {
  [Console]::Out.WriteLine($line)
  [Console]::Out.Flush()
}

# Если backend завершился (в т.ч. перезапуск node --watch), скрипт тоже выходит и освобождает порт
function Test-ParentAlive {
  if ($ParentPid -le 0) { return $true }
  return [bool](Get-Process -Id $ParentPid -ErrorAction SilentlyContinue)
}

# auto — первый COM-порт USB-устройства (Bluetooth-порты и т.п. пропускаются)
function Resolve-PortName {
  if ($PortName -ne 'auto') { return $PortName }
  $usbPort = Get-CimInstance Win32_PnPEntity -Filter "PNPDeviceID LIKE 'USB%'" |
    Where-Object { $_.Name -match '\((COM\d+)\)' } |
    ForEach-Object { $Matches[1] } |
    Select-Object -First 1
  return $usbPort
}

while (Test-ParentAlive) {
  $name = Resolve-PortName
  if (-not $name) {
    Send 'WAIT USB COM-порт сканера не найден'
    Start-Sleep -Seconds 5
    continue
  }

  $port = New-Object System.IO.Ports.SerialPort $name, $BaudRate, 'None', 8, 'One'
  try {
    $port.Open()
  } catch {
    Send "WAIT $name не открывается: $($_.Exception.Message)"
    Start-Sleep -Seconds 5
    continue
  }

  Send "PORT $name"
  $buffer = ''
  $lastData = [DateTime]::Now
  $lastParentCheck = [DateTime]::Now
  try {
    while ($true) {
      $chunk = $port.ReadExisting()
      if ($chunk) {
        $buffer += $chunk
        $lastData = [DateTime]::Now
      }

      # Код заканчивается CR/LF; сканер без суффикса — код считается завершённым после паузы 150 мс
      while ($buffer -match '[\r\n]') {
        $idx = $buffer.IndexOfAny([char[]]"`r`n")
        $line = $buffer.Substring(0, $idx).Trim()
        $buffer = $buffer.Substring($idx + 1)
        if ($line) { Send "SCAN $line" }
      }
      if ($buffer.Trim() -and ([DateTime]::Now - $lastData).TotalMilliseconds -gt 150) {
        Send "SCAN $($buffer.Trim())"
        $buffer = ''
      }

      if (([DateTime]::Now - $lastParentCheck).TotalSeconds -ge 1) {
        if (-not (Test-ParentAlive)) { return }
        $lastParentCheck = [DateTime]::Now
      }
      Start-Sleep -Milliseconds 20
    }
  } catch {
    # Сканер отключили или порт пропал — ждём и подключаемся заново
    Send "WAIT $name отключён: $($_.Exception.Message)"
    Start-Sleep -Seconds 2
  } finally {
    if ($port.IsOpen) { $port.Close() }
    $port.Dispose()
  }
}
