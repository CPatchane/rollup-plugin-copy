'use strict';

function _interopDefault (ex) { return (ex && (typeof ex === 'object') && 'default' in ex) ? ex['default'] : ex; }

var path = _interopDefault(require('path'));
var util = _interopDefault(require('util'));
var fs = _interopDefault(require('fs-extra'));
var isObject = _interopDefault(require('is-plain-object'));
var globby = _interopDefault(require('globby'));
var colorette = require('colorette');

function stringify(value) {
  return util.inspect(value, {
    breakLength: Infinity
  });
}

function renameTarget(target, rename) {
  const parsedPath = path.parse(target);
  return typeof rename === 'string' ? rename : rename(parsedPath.name, parsedPath.ext.replace('.', ''));
}

function generateCopyTarget(src, dest, rename, transform) {
  const basename = path.basename(src);
  let contents = null;

  if (transform) {
    if (!fs.lstatSync(src).isDirectory()) {
      contents = transform(fs.readFileSync(src));
    } else {
      console.log(colorette.yellow(`\`transform\` option only works on files, not on directories (received ${src})`));
    }
  }

  return {
    src,
    dest: path.join(dest, rename ? renameTarget(basename, rename) : basename),
    contents
  };
}

function copy(options = {}) {
  const {
    copyOnce = false,
    hook = 'buildEnd',
    targets = [],
    verbose = false,
    ...restPluginOptions
  } = options;
  let copied = false;
  return {
    name: 'copy',
    [hook]: async () => {
      if (copyOnce && copied) {
        return;
      }

      const copyTargets = [];

      if (Array.isArray(targets) && targets.length) {
        for (const target of targets) {
          if (!isObject(target)) {
            throw new Error(`${stringify(target)} target must be an object`);
          }

          const {
            src,
            dest,
            rename,
            transform,
            ...restTargetOptions
          } = target;

          if (!src || !dest) {
            throw new Error(`${stringify(target)} target must have "src" and "dest" properties`);
          }

          if (rename && typeof rename !== 'string' && typeof rename !== 'function') {
            throw new Error(`${stringify(target)} target's "rename" property must be a string or a function`);
          }

          const matchedPaths = await globby(src, {
            expandDirectories: false,
            onlyFiles: false,
            ...restPluginOptions,
            ...restTargetOptions
          });

          if (matchedPaths.length) {
            matchedPaths.forEach(matchedPath => {
              const generatedCopyTargets = Array.isArray(dest) ? dest.map(destination => generateCopyTarget(matchedPath, destination, rename, transform)) : [generateCopyTarget(matchedPath, dest, rename, transform)];
              copyTargets.push(...generatedCopyTargets);
            });
          }
        }
      }

      if (copyTargets.length) {
        if (verbose) {
          console.log(colorette.green('copied:'));
        }

        for (const {
          src,
          dest,
          contents
        } of copyTargets) {
          if (contents) {
            await fs.outputFile(dest, contents, restPluginOptions);
          } else {
            await fs.copy(src, dest, restPluginOptions);
          }

          if (verbose) {
            console.log(colorette.green(`  ${colorette.bold(src)} → ${colorette.bold(dest)}${contents ? ' (transformed)' : ''}`));
          }
        }
      } else if (verbose) {
        console.log(colorette.yellow('no items to copy'));
      }

      copied = true;
    }
  };
}

module.exports = copy;
