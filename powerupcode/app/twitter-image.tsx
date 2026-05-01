// Twitter card uses the same composition as OpenGraph. Re-exporting
// keeps the design in one place; if Twitter ever needs a distinct
// crop (e.g. summary card 1:1) we'll fork this file.
export {
  default,
  runtime,
  alt,
  size,
  contentType,
} from "./opengraph-image";
