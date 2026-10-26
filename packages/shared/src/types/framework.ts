export interface FrameworkInfo {
  name: string;
  displayName: string;
  category: string;
  defaultPort: number;
}

export interface DetectionResult {
  framework: string;
  displayName: string;
  confidence: number;
  detectedBy: string;
  defaultPort: number;
  hasDockerfile: boolean;
  packageManager: string | null;
  buildCommand: string | null;
  startCommand: string | null;
  installCommand: string | null;
  devCommand: string | null;
  outputDirectory: string | null;
  frameworkVersion: string | null;
}

export interface FrameworkDetectionInfo {
  framework: string;
  displayName: string;
  confidence: number;
  detectedBy: string;
  packageManager: string | null;
  buildCommand: string | null;
  startCommand: string | null;
  installCommand: string | null;
  devCommand: string | null;
  outputDirectory: string | null;
  frameworkVersion: string | null;
  detectedAt: string;
}
