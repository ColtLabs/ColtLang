[CmdletBinding()]
param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Arguments
)

$Exe = Join-Path $PSScriptRoot "colt.exe"
if (-not (Test-Path $Exe)) {
  $Exe = Join-Path $PSScriptRoot "colt-native.exe"
}

if (Test-Path $Exe) {
  & $Exe @Arguments
  exit $LASTEXITCODE
}

& colt @Arguments
exit $LASTEXITCODE
