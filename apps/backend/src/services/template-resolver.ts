import { AppError } from "../lib/errors.js";
import { templateRegistry, type Template } from "./template-registry.js";
import type { DetectionResult } from "@pulse/shared";

/**
 * TemplateResolver determines which template to use for a given framework detection.
 *
 * Single responsibility: framework → template resolution.
 * No fallback logic. If a template doesn't exist, it fails with a descriptive error.
 */
export class TemplateResolver {
  /**
   * Resolve a template for the given detection result.
   *
   * @throws DeploymentError if no template exists for the detected framework.
   */
  resolve(detection: DetectionResult): Template {
    // Custom Dockerfiles bypass the template system
    if (detection.framework === "custom") {
      const customTemplate = templateRegistry.get("custom");
      if (!customTemplate) {
        throw new AppError(
          'Template "custom" not found. Ensure the custom template is installed.',
          500,
          "CUSTOM_TEMPLATE_MISSING"
        );
      }
      return customTemplate;
    }

    const template = templateRegistry.get(detection.framework);

    if (!template) {
      const available = templateRegistry.getFrameworkNames().join(", ");
      throw new AppError(
        `No deployment template found for framework "${detection.framework}". ` +
          `Available templates: ${available}`,
        400,
        "TEMPLATE_NOT_FOUND"
      );
    }

    return template;
  }
}

export const templateResolver = new TemplateResolver();
