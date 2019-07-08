const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout,
});

const handleError = async (err, currentBranch) => {
  console.log(err.stderr.trim());
  await exec(`git checkout ${currentBranch}`);
  process.exit(1);
}

readline.question('What is the release version? ', async (version) => {
  const getCurrentBranch = await exec('git rev-parse --abbrev-ref HEAD');
  const currentBranch = getCurrentBranch.stdout.trim();
  await exec('git fetch');
  const getCurrentRC = await exec(`git branch --all | grep "origin/rc-" | awk -F'/' '{print $3}'`);
  const currentRC = getCurrentRC.stdout.trim();

  if (version.match(/\d+.[0]/)) {
    handleMajorRelease(version, currentBranch, currentRC);
  } else if (version.match(/\d+.[1-9]/)) {
    handleMinorRelease(version, currentBranch, currentRC);
  } else {
    console.log('Invalid version');
  }
});

const handleMajorRelease = async (version, currentBranch, currentRC) => {
  try {
    if (currentRC) { // delete the current rc branch if there is one
      await exec(`git push origin --delete ${currentRC}`);
    }

    await exec('git checkout development');
    await exec('git pull origin development');
    await exec(`git checkout -b rc-v${version}`);
    await exec('git remote prune origin');
    await exec(`git push origin rc-v${version}`);

    console.log(`rc-v${version} is pushed to origin, beta build will automatically start, please verify on https://jenkins.moveaws.com, and search for rc-v${version}`);
  } catch (err) {
    handleError(err, currentBranch);
  } finally {
    readline.close();
  }
};

const handleMinorRelease = (version, currentBranch, currentRC) => {
  // get the commit hash
  readline.question('What is the commit that you want? ', async (commit) => {
    try {
      if (currentRC && currentRC === `rc-v${version}`) { // This is for cherry-picking commits after the tag cut
        await exec(`git checkout rc-v${version}`);
        await exec(`git cherry-pick ${commit}`);
        await exec(`git push origin --delete ${currentRC}`);
        await exec(`git remote prune origin`);
        await exec(`git push origin rc-v${version}`);
      } else { // This is for hotfix
        const getLatestTag = await exec(`git describe --tags \`git rev-list --tags --max-count=1\``);
        const tag = getLatestTag && getLatestTag.stdout && getLatestTag.stdout.trim();
        await exec(`git checkout -b rc-v${version} v${tag}`);
        await exec(`git cherry-pick ${commit}`);
        if (currentRC) {
          await exec(`git push origin --delete ${currentRC}`);
          await exec(`git remote prune origin`);
        }
        await exec(`git push origin rc-v${version}`);
      }

      console.log(`rc-v${version} is pushed to origin, beta build will automatically start, please verify on https://jenkins.moveaws.com, and search for rc-v${version}`);
    } catch (err) {
      handleError(err, currentBranch);
    } finally {
      readline.close();
    }
  });
};
