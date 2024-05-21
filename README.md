# Trident: A Decentralized Exchange (DEX) Platform

Trident is a decentralized exchange (DEX) platform built using the proto-kit framework and o1js, a zero-knowledge circuit framework for the Mina blockchain. This project aims to provide a secure, privacy-preserving, and efficient trading platform for users to exchange tokens.

## Features

- Support for orderbook-based exchanges
- Zero-knowledge proofs for privacy and security
- Integration with the Mina blockchain
- Modular architecture using proto-kit runtime modules
- Comprehensive test suite for ensuring correctness and reliability

## Prerequisites

Before getting started with Trident, ensure that you have the following prerequisites installed:

- Node.js (version 20.10.0 or higher)
- pnpm package manager (version 8.6.10 or higher)

## Getting Started

To set up the Trident project locally, follow these steps:

1. Clone the repository:
```bash
git clone https://github.com/your-username/trident.git
```

2. Navigate to the project directory:
```bash
cd trident
```

3. Install the dependencies using pnpm:
```bash
pnpm install
```

4. Build the project:
```bash
pnpm build
```

5. Run the tests:
```bash
pnpm test
```

6. Start the development server:
```bash
pnpm dev
```

## Project Structure

The Trident project follows a monorepo structure using Turborepo. The main packages are located in the `packages` directory:

- `chain`: Contains the core runtime modules, configurations, and tests .
- 'chain/src/runtime': Contains the runtime modules for the orderbook.

## Contributing

We welcome contributions to the Trident project! If you'd like to contribute, please follow these steps:

1. Fork the repository.
2. Create a new branch for your feature or bug fix.
3. Make your changes and commit them with descriptive messages.
4. Push your changes to your forked repository.
5. Submit a pull request to the main repository.

Please ensure that your code follows the project's coding conventions and passes all the tests before submitting a pull request.

## License

The Trident project is licensed under the [MIT License](LICENSE).

## Contact

If you have any questions, suggestions, or feedback, please feel free to reach out to the project maintainers at [insert contact email or link to communication channel].

Thank you for your interest in Trident! We look forward to building a secure and efficient DEX platform together.