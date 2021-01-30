# Keyboard Layout Utils

Provide a function to parse KLE (Keyboard Layout Editor) raw data, and do various things with it.

- Read KLE raw data from left.txt and right.txt, and output out.svg for laser cutting
- Output the x and y positions of where the key holes should, for example to do modelling in OpenSCAD

### Setup
```
yarn
```

### Compile and run
```
tsc && node index.js
```
or
```
yarn start
```

### Continuous compile
```
yarn run tsc -w
```
