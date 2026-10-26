/**
 * Sponsor a Visit (Student role)
 *
 * The same request form visitors use, which already handles students: it asks for the
 * parent or guardian who will visit, and the server issues the permit in their name
 * (VISION.md §3.4). Re-exported here because the visitor shell, (main), admits only
 * visitors and parents.
 */
export { default } from '../(main)/requests/new';
