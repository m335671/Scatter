Pod::Spec.new do |s|
  s.name           = 'Torch'
  s.version        = '0.1.0'
  s.summary        = 'Lampe du téléphone (Scatter)'
  s.author         = 'Scatter'
  s.homepage       = 'https://github.com/m335671/Scatter'
  s.license        = 'MIT'
  s.platform       = :ios, '15.1'
  s.swift_version  = '5.4'
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'SWIFT_COMPILATION_MODE' => 'wholemodule' }
  s.source_files = '**/*.{h,m,swift}'
end
