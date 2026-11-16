import type { MDXComponents } from "mdx/types";
import { BinaryConverter } from "@/components/learn/binary-converter";
import { Callout } from "@/components/learn/callout";
import { EncapsulationDemo } from "@/components/learn/encapsulation-demo";
import { LabCTA } from "@/components/learn/lab-cta";
import { OsiLayers } from "@/components/learn/osi-layers";
import { Quiz } from "@/components/learn/quiz";
import { RoutingTableDemo } from "@/components/learn/routing-table-demo";
import { SequenceDiagram } from "@/components/learn/sequence-diagram";
import { SubnetCalculator } from "@/components/learn/subnet-calculator";
import { TopologyShapes } from "@/components/learn/topology-shapes";

const components: MDXComponents = {
  BinaryConverter,
  Callout,
  EncapsulationDemo,
  LabCTA,
  OsiLayers,
  Quiz,
  RoutingTableDemo,
  SequenceDiagram,
  SubnetCalculator,
  TopologyShapes,
};

export function useMDXComponents(): MDXComponents {
  return components;
}
