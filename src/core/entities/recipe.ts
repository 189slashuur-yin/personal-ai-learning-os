export type Recipe = {
  id: string;
  name: string;
  description: string;
  triggerType: "manual";
  steps: string[];
  createdAt: string;
  updatedAt: string;
};
