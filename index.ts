import { promises as fs } from 'fs';

interface FieldData {
  x: number;
  w: number;
}
type KeyboardLayoutField = FieldData | 'key';

const u = 19.05;
const hole_width = 14;
const hole_gap = u - hole_width;
// How much space around the outside of the board - must be > 0
const board_padding = hole_gap;
// The diameter (mm) that this particular laser cuts out
const kerf = 0.2;
const kerf2 = 0.5*kerf;
const board_width = 7.75*u - hole_gap + 2*board_padding;
const board_height = 5*u - hole_gap + 2*board_padding;
const corner_radius = 5.05;
const board_offset_x = 0*(board_width + 5);
const board_offset_y = 0*(board_height + 5);
// M2 >= 2.0
const screw_size_small = 2.1;
// spacer >= 3.3
const screw_size_big = 3.4;
const screw_padding = hole_gap;

function parseKeyboardLayoutField(text: string): [KeyboardLayoutField, string] | 'error' {
  if (text.length === 0) {
    return 'error';
  }

  if (text.charAt(0) === '{') {
    let res = {x: -1, w: -1};
    let endPos = text.indexOf('}');
    if (endPos === -1) {
      return 'error';
    }

    let pairs = text.slice(1, endPos).split(',');
    for (let pairText of pairs) {
      let pair = pairText.split(':');
      if (pair[0] === 'x') {
        res.x = parseFloat(pair[1]);
      }
      if (pair[0] === 'w') {
        res.w = parseFloat(pair[1]);
      }
    }

    return [res, text.slice(endPos+1)];
  } else if (text.charAt(0) === '"') {
    let pos = 1;
    while (pos < text.length && text.charAt(pos) !== '"') {
      if (text.charAt(pos) === '\\') {
        pos++;
      }
      pos++;
    }
    if (pos >= text.length) {
      return 'error';
    }

    return ['key', text.slice(pos+1)];
  } else {
    return 'error';
  }
}
function parseKeyboardLayoutLine(text: string): [FieldData[], string] | 'error' {
  let x = 0;
  let lastFieldData: FieldData | undefined;
  let res: FieldData[] = [];
  while (text.length > 0 && text.charAt(0) !== ']') {
    if (text.charAt(0) === ',') {
      text = text.slice(1);
    }
    let field: KeyboardLayoutField;
    let pair = parseKeyboardLayoutField(text);
    if (pair === 'error') {
      return 'error';
    }

    [field, text] = pair;

    if (field === 'key') {
      let fieldData = {x: x, w: 1};
      if (lastFieldData !== undefined && lastFieldData.x !== -1) {
        x = lastFieldData.x;
        fieldData.x = x;
      }
      if (lastFieldData !== undefined && lastFieldData.w !== -1) {
        fieldData.w = lastFieldData.w;
      }

      res.push(fieldData);

      lastFieldData = undefined;
      x += fieldData.w;
    } else {
      lastFieldData = field;
    }
  }

  return [res, text];
}
function parseKeyboardLayout(text: string): FieldData[][] | 'error' {
  let res: FieldData[][] = [];
  while (text.length > 0) {
    if (text.charAt(0) !== '[') {
      return 'error';
    }
    let pair = parseKeyboardLayoutLine(text.slice(1));
    if (pair === 'error') {
      return 'error';
    }
    let values: FieldData[];
    [values, text] = pair;
    res.push(values);

    while (text.length > 0 && (text.charAt(0) !== '[')) {
      text = text.slice(1);
    }
  }

  return res;
}

function showKeyPositions(keyboardName: string, layoutText: string) {
  console.log(keyboardName);
  let layout = parseKeyboardLayout(layoutText);
  if (layout === 'error') {
    console.log('error');
    return;
  }

  for (let row = 0; row < layout.length; row++) {
    let rowText = '    ';
    for (let col = 0; col < layout[row].length; col++) {
      let x = layout[row][col].x + 0.5*(layout[row][col].w - 1);
      rowText += `[${x},${row}],`;
    }
    console.log(rowText);
  }

  console.log('');
}

// Get part of the svg text for a sandwich layer, assuming the board outline came beforehand.
// This includes gaps at the top for micro usb and trrs, and screw holes.
function get_layer(top_length_left: number, top_length_right: number): string {
  let text = '';
  text += `      h ${top_length_left-corner_radius+kerf2} v ${board_padding+kerf}\n`;
  // top left screw padding
  // kerf cancels out
  text += `      h -${top_length_left-(screw_size_big+2*screw_padding)} v ${screw_size_big+2*screw_padding-board_padding}\n`;
  text += `      h -${screw_size_big+2*screw_padding-board_padding} v ${board_height-2*(screw_size_big+2*screw_padding)-kerf}\n`;
  // bottom left screw padding
  text += `      h ${screw_size_big+2*screw_padding-board_padding} v ${screw_size_big+2*screw_padding-board_padding}\n`;
  // bottom right screw padding
  text += `      h ${board_width-2*(screw_size_big+2*screw_padding)-kerf} v -${screw_size_big+2*screw_padding-board_padding}\n`;
  text += `      h ${screw_size_big+2*screw_padding-board_padding} v -${board_height-(screw_size_big+2*screw_padding)-board_padding-u-kerf}\n`;
  // top right screw padding (1u lower, so more tricky
  text += `      h -${top_length_right-board_padding} v -${board_padding+kerf}\n`;
  text += `      Z" />\n`;
  return text;
}

async function writeSvg(keyboardName: string, layoutText: string) {
  console.log(keyboardName);
  let layout = parseKeyboardLayout(layoutText);
  if (layout === 'error') {
    console.log('error');
    return;
  }

  // The outline of the board, aprt from the top, starting with the top right curve
  // Add kerf on all sides, so that key positions don't need to change
  let board_outline = '';
  board_outline += `    <path d="M ${board_width-corner_radius} ${-kerf2}\n`;
  board_outline += `      a ${corner_radius+kerf2} ${corner_radius+kerf2} 0 0 1 ${corner_radius+kerf2} ${corner_radius+kerf2}\n`;
  board_outline += `      v ${board_height-2*corner_radius} a ${corner_radius+kerf2} ${corner_radius+kerf2} 0 0 1 -${corner_radius+kerf2} ${corner_radius+kerf2}\n`;
  board_outline += `      h -${board_width-2*corner_radius} a ${corner_radius+kerf2} ${corner_radius+kerf2} 0 0 1 -${corner_radius+kerf2} -${corner_radius+kerf2}\n`;
  board_outline += `      v -${board_height-2*corner_radius} a ${corner_radius+kerf2} ${corner_radius+kerf2} 0 0 1 ${corner_radius+kerf2} -${corner_radius+kerf2}\n`;

  let text = '<?xml version="1.0" encoding="UTF-8"?>\n';
  text += '<svg xmlns="http://www.w3.org/2000/svg" width="790mm" height="384mm" viewBox="0 0 790 384"\n';
  text += '  style="fill:none;stroke:#000000;stroke-width:0.2">\n';
  text += '  <g transform="translate(0 0)">\n';
  text += board_outline;
  text += `      Z" />\n`;
  for (let row = 0; row < layout.length; row++) {
    for (let col = 0; col < layout[row].length; col++) {
      let x = layout[row][col].x + 0.5*(layout[row][col].w - 1);
      text += `    <rect width="${hole_width - kerf}" height="${hole_width - kerf}" x="${board_padding + x*u + kerf2}" y="${board_padding + row*u + kerf2}" />\n`;
    }
  }
  text += '  </g>\n';

  // Layer 2 - micro usb + trrs
  let usb_width2 = 5;
  // >= 2.5
  let trrs_width2 = 2.7;
  // the trrs socket is laid on its side, with the legs pointing towards the micro usb socket
  // half width of trrs + leg length >= 5.3
  let trrs_legs_width2 = 7.0;
  text += `  <g transform="translate(0 ${board_offset_y})">\n`;
  let layer2_left: number;
  let layer2_right: number;
  if (keyboardName === 'left') {
    layer2_left = board_padding - 0.5*hole_gap + 5.5*u - usb_width2;
    layer2_right = board_padding - 0.5*hole_gap + 1.25*u - trrs_width2;
  } else {
    // Close enough to the same position, so just line it up with the screw padding
    layer2_left = screw_size_big+2*screw_padding;
    //layer2_left = board_padding - 0.5*hole_gap + 0.75*u - trrs_width2;
    layer2_right = board_padding - 0.5*hole_gap + 6.0*u - usb_width2;
  }
  text += board_outline;
  text += get_layer(layer2_left, layer2_right);
  text += '  </g>\n';

  // Layer 4
  text += `  <g transform="translate(${board_offset_x} ${board_offset_y})">\n`;
  text += board_outline;
  text += `      Z" />\n`;
  text += '  </g>\n';

  text += '</svg>\n';

  await fs.writeFile(keyboardName + '.svg', text, 'utf8');
}

async function main() {
  let leftText = await fs.readFile('left.txt', 'utf8');
  let rightText = await fs.readFile('right.txt', 'utf8');
  //showKeyPositions('left', leftText);
  //showKeyPositions('right', rightText);
  await writeSvg('left', leftText);
  await writeSvg('right', rightText);
}

main();
