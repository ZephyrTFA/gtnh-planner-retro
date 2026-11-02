import { setDatasetFileSource } from "@/lib/dataset-engine/source";
import { createNodeDatasetSource } from "./node-dataset-source";

// The recipe engine in Node reads the dataset from public/ on disk.
setDatasetFileSource(createNodeDatasetSource());

export * from "@/lib/dataset-engine/engine";
