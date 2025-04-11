// Simple page load function to pass data from server to client
export const load = async ({ data }: { data: { id: string | null; dTag: string | null } }) => {
  // Pass the data from the server to the client
  return {
    id: data.id,
    dTag: data.dTag
  };
};
