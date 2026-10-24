[CmdletBinding()]
param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$Arguments
)

if ($null -eq $Arguments -or $Arguments.Count -eq 0) {
  & "$PSScriptRoot\colt-native.exe" --help
  exit $LASTEXITCODE
}

if ($Arguments[0] -eq 'run') {
  & node --import tsx "E:\Projects\ColtLang\packages\cli\src\main.ts" @Arguments
  exit $LASTEXITCODE
}

& "$PSScriptRoot\colt-native.exe" @Arguments
exit $LASTEXITCODE
