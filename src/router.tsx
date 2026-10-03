import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import { routeTree } from "./routeTree.gen";

const getSSROptions = createIsomorphicFn()
  .server(() => {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const nonce = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

    return { nonce };
  })
  .client(() => ({}));

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    ssr: getSSROptions(),
  });

  return router;
};
