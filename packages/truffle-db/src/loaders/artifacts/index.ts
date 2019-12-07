import gql from "graphql-tag";
import { TruffleDB } from "truffle-db/db";
import * as Contracts from "@truffle/workflow-compile/new";
import { ContractObject } from "@truffle/contract-schema/spec";
import * as fse from "fs-extra";
import path from "path";
import Config from "@truffle/config";
import { Environment } from "@truffle/environment";
import Web3 from "web3";
import { shimBytecode } from "@truffle/workflow-compile/shims";

const AddBytecodes = gql`
  input LinkReferenceInput {
    offsets: [Int]
    name: String
    length: Int
  }

  input BytecodeInput {
    bytes: Bytes!
    linkReferences: [LinkReferenceInput]!
  }

  mutation AddBytecodes($bytecodes: [BytecodeInput!]!) {
    workspace {
      bytecodesAdd(input: { bytecodes: $bytecodes }) {
        bytecodes {
          id
          linkReferences {
            offsets
            name
            length
          }
        }
      }
    }
  }
`;

const AddSources = gql`
  input SourceInput {
    contents: String!
    sourcePath: String
  }

  mutation AddSource($sources: [SourceInput!]!) {
    workspace {
      sourcesAdd(input: { sources: $sources }) {
        sources {
          id
          contents
          sourcePath
        }
      }
    }
  }
`;

const AddCompilation = gql`
  input CompilerInput {
    name: String
    version: String
    settings: Object
  }

  input CompilationSourceInput {
    id: ID!
  }

  input CompilationSourceContractSourceInput {
    id: ID!
  }

  input CompilationSourceContractAstInput {
    json: String!
  }

  input CompilationSourceMapInput {
    json: String!
  }

  input CompilationSourceContractInput {
    name: String
    source: CompilationSourceContractSourceInput
    ast: CompilationSourceContractAstInput
  }

  input CompilationInput {
    compiler: CompilerInput!
    contracts: [CompilationSourceContractInput!]
    sources: [CompilationSourceInput!]!
    sourceMaps: [CompilationSourceMapInput]
  }
  input CompilationsAddInput {
    compilations: [CompilationInput!]!
  }

  mutation AddCompilation($compilations: [CompilationInput!]!) {
    workspace {
      compilationsAdd(input: { compilations: $compilations }) {
        compilations {
          id
          compiler {
            name
            version
          }
          contracts {
            name
            source {
              contents
              sourcePath
            }
            ast {
              json
            }
          }
          sources {
            contents
            sourcePath
          }
          sourceMaps {
            json
          }
        }
      }
    }
  }
`;

const AddContracts = gql`
  input AbiInput {
    json: String!
    items: [String]
  }

  input ContractCompilationInput {
    id: ID!
  }

  input ContractSourceContractInput {
    index: FileIndex
  }

  input ContractConstructorBytecodeInput {
    id: ID!
  }

  input ContractConstructorLinkedBytecodeInput {
    bytecode: ContractConstructorBytecodeInput!
  }

  input ContractConstructorInput {
    createBytecode: ContractConstructorLinkedBytecodeInput!
  }

  input ContractInput {
    name: String
    abi: AbiInput
    compilation: ContractCompilationInput
    sourceContract: ContractSourceContractInput
    constructor: ContractConstructorInput
  }

  mutation AddContracts($contracts: [ContractInput!]!) {
    workspace {
      contractsAdd(input: { contracts: $contracts }) {
        contracts {
          id
          name
          abi {
            json
          }
          sourceContract {
            name
            source {
              contents
              sourcePath
            }
            ast {
              json
            }
          }
          compilation {
            compiler {
              name
              version
            }
            contracts {
              name
              source {
                contents
                sourcePath
              }
              ast {
                json
              }
            }
            sources {
              contents
              sourcePath
            }
          }
          constructor {
            createBytecode {
              bytecode {
                bytes
                linkReferences {
                  offsets
                  name
                  length
                }
              }
            }
          }
        }
      }
    }
  }
`;

const AddContractInstances = gql`
  input ContractInstanceNetworkInput {
    id: ID!
  }

  input ContractInstanceContractInput {
    id: ID!
  }

  input ContractInstanceCreationConstructorBytecodeInput {
    id: ID!
  }

  input LinkReferenceInput {
    offsets: [Int]
    name: String
    length: Int
  }

  input LinkValueLinkReferenceInput {
    bytecode: ID!
    index: FileIndex
  }

  input LinkValueInput {
    value: String!
    linkReference: LinkValueLinkReferenceInput!
  }

  input ContractInstanceCreationConstructorLinkedBytecodeInput {
    bytecode: ContractInstanceCreationConstructorBytecodeInput!
    linkValues: [LinkValueInput]
  }

  input ContractInstanceCallBytecodeInput {
    id: ID!
  }

  input ContractInstanceLinkedCallBytecodeInput {
    bytecode: ContractInstanceBytecodeInput
    linkValues: [LinkValueInput]
  }

  input ContractInstanceCreationConstructorInput {
    createBytecode: ContractInstanceCreationConstructorLinkedBytecodeInput!
  }

  input ContractInstanceCreationInput {
    transactionHash: TransactionHash!
    constructor: ContractInstanceCreationConstructorInput!
  }

  input ContractInstanceInput {
    address: Address!
    network: ContractInstanceNetworkInput!
    creation: ContractInstanceCreationInput
    contract: ContractInstanceContractInput
    callBytecode: ContractInstanceLinkedCallBytecodeInput
  }

  mutation AddContractInstances($contractInstances: [ContractInstanceInput!]!) {
    workspace {
      contractInstancesAdd(input: { contractInstances: $contractInstances }) {
        contractInstances {
          address
          network {
            name
            networkID
            historicBlock {
              height
              hash
            }
          }
          contract {
            name
          }
          creation {
            transactionHash
            constructor {
              createBytecode {
                bytecode {
                  bytes
                  linkReferences {
                    offsets
                    name
                    length
                  }
                }
                linkValues {
                  value
                  linkReference {
                    offsets
                    name
                    length
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

const AddNetworks = gql`
  input HistoricBlockInput {
    height: Int!
    hash: String!
  }

  input NetworkInput {
    name: String
    networkId: NetworkId!
    historicBlock: HistoricBlockInput!
  }

  mutation AddNetworks($networks: [NetworkInput!]!) {
    workspace {
      networksAdd(input: { networks: $networks }) {
        networks {
          id
          networkId
          historicBlock {
            height
            hash
          }
        }
      }
    }
  }
`;

type WorkflowCompileResult = {
  compilations: {
    [compilerName: string]: {
      sourceIndexes: Array<string>;
      contracts: Array<ContractObject>;
    };
  };
  contracts: { [contractName: string]: ContractObject };
};

type networkLinkObject = {
  [name: string]: string;
};

type LoaderNetworkObject = {
  contract: string;
  id: string;
  address: string;
  transactionHash: string;
  links?: networkLinkObject;
};

type LinkReferenceObject = {
  offsets: Array<number>;
  name: string;
  length: number;
};

type BytecodeInfo = {
  id: string;
  linkReferences: Array<LinkReferenceObject>;
  bytes?: string;
};

type BytecodesObject = {
  bytecodes: Array<BytecodeInfo>;
  callBytecodes: Array<BytecodeInfo>;
};

type IdObject = {
  id: string;
};

type CompilationConfigObject = {
  contracts_directory?: string;
  contracts_build_directory?: string;
  artifacts_directory?: string;
  working_directory?: string;
  all?: boolean;
};

export class ArtifactsLoader {
  private db: TruffleDB;
  private config: object;

  constructor(db: TruffleDB, config?: CompilationConfigObject) {
    this.db = db;
    this.config = config;
  }

  async load(): Promise<void> {
    const compilationsOutput = await this.loadCompilation(this.config);
    const { compilations, contracts } = compilationsOutput;
    //map contracts and contract instances to compiler
    await Promise.all(
      compilations.data.workspace.compilationsAdd.compilations.map(
        async ({ compiler, id }) => {
          const contractIds = await this.loadCompilationContracts(
            contracts[compiler.name].contracts,
            id,
            compiler.name
          );
          const networks = await this.loadNetworks(
            contracts[compiler.name].contracts,
            this.config["artifacts_directory"],
            this.config["contracts_directory"]
          );
          if (networks[0].length) {
            this.loadContractInstances(
              contracts[compiler.name].contracts,
              contractIds.contractIds,
              networks,
              contractIds.bytecodes
            );
          }
        }
      )
    );
  }

  async loadCompilationContracts(
    contracts: Array<ContractObject>,
    compilationId: string,
    compilerName: string
  ) {
    const bytecodes = await this.loadBytecodes(contracts);
    const contractObjects = contracts.map((contract, index) => ({
      name: contract["contractName"],
      abi: {
        json: JSON.stringify(contract["abi"])
      },
      compilation: {
        id: compilationId
      },
      sourceContract: {
        index: index
      },
      constructor: {
        createBytecode: {
          bytecode: { id: bytecodes.bytecodes[index].id }
        }
      }
    }));

    const contractsLoaded = await this.db.query(AddContracts, {
      contracts: contractObjects
    });

    const contractIds = contractsLoaded.data.workspace.contractsAdd.contracts.map(
      ({ id }) => ({ id })
    );

    return {
      compilerName: contracts[0].compiler.name,
      contractIds: contractIds,
      bytecodes: bytecodes
    };
  }

  async loadBytecodes(
    contracts: Array<ContractObject>
  ): Promise<BytecodesObject> {
    // transform contract objects into data model bytecode inputs
    // and run mutation
    let bytecodes = [];
    let deployedBytecodes = [];
    contracts.map(({ deployedBytecode, bytecode }) => {
      bytecodes.push(bytecode);
      deployedBytecodes.push(deployedBytecode);
    });

    const bytecodeResult = await this.db.query(AddBytecodes, {
      bytecodes: bytecodes
    });
    const callBytecodeResult = await this.db.query(AddBytecodes, {
      bytecodes: deployedBytecodes
    });

    return {
      bytecodes: bytecodeResult.data.workspace.bytecodesAdd.bytecodes,
      callBytecodes: callBytecodeResult.data.workspace.bytecodesAdd.bytecodes
    };
  }

  async loadCompilationSources(contracts: Array<ContractObject>) {
    // transform contract objects into data model source inputs
    // and run mutation
    const result = await this.db.query(AddSources, {
      sources: contracts.map(({ source, sourcePath }) => ({
        contents: source,
        sourcePath
      }))
    });

    // extract sources
    const sources = result.data.workspace.sourcesAdd.sources;

    // return only array of objects { id }
    return sources.map(({ id }) => ({ id }));
  }

  async compilationSourceContracts(
    compilation: Array<ContractObject>,
    sourceIds: Array<IdObject>
  ) {
    return compilation.map(({ contractName: name, ast }, index) => ({
      name,
      source: sourceIds[index],
      ast: ast ? { json: JSON.stringify(ast) } : undefined
    }));
  }

  async setCompilation(organizedCompilation: Array<ContractObject>) {
    const sourceIds = await this.loadCompilationSources(organizedCompilation);
    const sourceContracts = await this.compilationSourceContracts(
      organizedCompilation,
      sourceIds
    );

    const compilationObject = {
      compiler: {
        name: organizedCompilation[0]["compiler"]["name"],
        version: organizedCompilation[0]["compiler"]["version"]
      },
      contracts: sourceContracts,
      sources: sourceIds
    };

    if (organizedCompilation[0]["compiler"]["name"] == "solc") {
      compilationObject["sourceMaps"] = organizedCompilation.map(
        ({ sourceMap }) => {
          return { json: sourceMap };
        }
      );
    }

    return compilationObject;
  }

  async loadNetworks(
    contracts: Array<ContractObject>,
    artifacts: string,
    workingDirectory: string
  ) {
    const networksByContract = await Promise.all(
      contracts.map(async ({ contractName, bytecode }) => {
        const name = contractName.toString().concat(".json");
        const artifactsNetworksPath = fse.readFileSync(
          path.join(artifacts, name)
        );
        const artifactsNetworks = JSON.parse(artifactsNetworksPath.toString())
          .networks;
        let configNetworks = [];
        if (Object.keys(artifactsNetworks).length) {
          const config = Config.detect({ workingDirectory: workingDirectory });
          for (let network of Object.keys(config.networks)) {
            config.network = network;
            await Environment.detect(config);
            let networkId;
            let web3;
            try {
              web3 = new Web3(config.provider);
              networkId = await web3.eth.net.getId();
            } catch (err) {}

            if (networkId) {
              let filteredNetwork = Object.entries(artifactsNetworks).filter(
                network => network[0] == networkId
              );
              //assume length of filteredNetwork is 1 -- shouldn't have multiple networks with same id in one contract
              if (filteredNetwork.length > 0) {
                const transaction = await web3.eth.getTransaction(
                  filteredNetwork[0][1]["transactionHash"]
                );
                const historicBlock = {
                  height: transaction.blockNumber,
                  hash: transaction.blockHash
                };

                const networksAdd = await this.db.query(AddNetworks, {
                  networks: [
                    {
                      name: network,
                      networkId: networkId,
                      historicBlock: historicBlock
                    }
                  ]
                });

                const id =
                  networksAdd.data.workspace.networksAdd.networks[0].id;
                configNetworks.push({
                  contract: contractName,
                  id: id,
                  address: filteredNetwork[0][1]["address"],
                  transactionHash: filteredNetwork[0][1]["transactionHash"],
                  bytecode: bytecode,
                  links: filteredNetwork[0][1]["links"]
                });
              }
            }
          }
        }
        return configNetworks;
      })
    );
    return networksByContract;
  }

  getNetworkLinks(network: LoaderNetworkObject, bytecode: BytecodeInfo) {
    let networkLink = {};
    if (network.links) {
      networkLink = Object.entries(network.links).map(link => {
        let linkReferenceByName = bytecode.linkReferences.filter(
          ({ name }, index) => name === link[0]
        );

        let linkValue = {
          value: link[1],
          linkReference: linkReferenceByName[0]
        };
        return linkValue;
      });
    }

    return networkLink;
  }

  async loadContractInstances(
    contracts: Array<ContractObject>,
    contractIds: Array<IdObject>,
    networksArray: Array<Array<LoaderNetworkObject>>,
    bytecodes: BytecodesObject
  ) {
    // networksArray is an array of arrays of networks for each contract;
    // this first mapping maps to each contract
    const instances = networksArray.map((networks, index) => {
      // this second mapping maps each network in a contract
      const contractInstancesByNetwork = networks.map(network => {
        let createBytecodeLinkValues = this.getNetworkLinks(
          network,
          bytecodes.bytecodes[index]
        );
        let callBytecodeLinkValues = this.getNetworkLinks(
          network,
          bytecodes.callBytecodes[index]
        );

        let instance = {
          address: network.address,
          contract: contractIds[index],
          network: {
            id: network.id
          },
          creation: {
            transactionHash: network.transactionHash,
            constructor: {
              createBytecode: {
                bytecode: { id: bytecodes.bytecodes[index].id },
                linkValues: createBytecodeLinkValues
              }
            }
          },
          callBytecode: {
            bytecode: { id: bytecodes.callBytecodes[index].id },
            linkValues: callBytecodeLinkValues
          }
        };
        return instance;
      });

      return contractInstancesByNetwork;
    });

    await this.db.query(AddContractInstances, {
      contractInstances: instances.flat()
    });
  }

  async loadCompilation(compilationConfig: CompilationConfigObject) {
    const compilationOutput = await Contracts.compile(compilationConfig);
    const contracts = compilationOutput.compilations;

    const compilationObjects = await Promise.all(
      Object.values(contracts)
        .filter(contracts => contracts["contracts"].length > 0)
        .map(({ contracts }) => {
          return this.setCompilation(contracts);
        })
    );

    const compilations = await this.db.query(AddCompilation, {
      compilations: compilationObjects
    });

    return { compilations, contracts };
  }
}
