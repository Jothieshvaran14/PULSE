import { templateRegistry } from "./src/services/template-registry.js";
import { templateResolver } from "./src/services/template-resolver.js";
import { templateRenderer } from "./src/services/template-renderer.js";

await templateRegistry.loadAll();

const detection = {
  framework: "react-vite", displayName: "React (Vite)", confidence: 0.95,
  detectedBy: "package.json", defaultPort: 80, hasDockerfile: false,
  packageManager: "npm", buildCommand: "vite build",
  startCommand: "vite preview --host 0.0.0.0", installCommand: "npm install",
  devCommand: "vite dev", outputDirectory: "dist", frameworkVersion: null,
};

const template = templateResolver.resolve(detection);
const rendered = templateRenderer.render(template, detection, "test-project");

console.log("Framework:", template.metadata.framework);
console.log("Proxy:", template.metadata.proxy);
console.log("Port:", template.metadata.containerPort);
console.log("Output:", template.metadata.outputDirectory);
console.log("Dockerfile lines:", rendered.dockerfile.split("\n").length);
console.log("Has nginx.conf:", !!rendered.nginxConf);

// Verify build commands are correct for react-vite
const df = rendered.dockerfile;
const hasNginx = df.includes("nginx:alpine");
const hasCopy = df.includes("COPY dist");
const hasChmod = df.includes("chmod");
const hasNginxConf = df.includes("nginx.conf");

console.log("Uses nginx:", hasNginx);
console.log("Copies dist:", hasCopy);
console.log("Has chmod fix:", hasChmod);
console.log("Has nginx.conf COPY:", hasNginxConf);

if (hasNginx && hasCopy && hasChmod && hasNginxConf) {
  console.log("PASS");
} else {
  console.log("FAIL");
  process.exit(1);
}
