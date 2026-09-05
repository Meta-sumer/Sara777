/* Where the admin panel finds the API.
 *
 * Empty string means "same origin", which is correct when the API itself serves
 * this folder at /admin. The standalone static site overwrites this file at build
 * time with the API's public origin (see the sara777-admin service in render.yaml).
 */
window.ADMIN_API_ORIGIN = '';
