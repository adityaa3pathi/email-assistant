/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
    typescript: {
        ignoreBuildErrors: true
    },
    eslint: {
        ignoreDuringBuilds: true
    },
    experimental: {
        optimizePackageImports: ["lucide-react", "@radix-ui/react-avatar", "@radix-ui/react-dropdown-menu", "date-fns"],
    },
};

export default config;
