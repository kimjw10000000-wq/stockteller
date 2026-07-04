/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [{ source: "/", destination: "/feed", permanent: false }];
  },
};

export default nextConfig;
