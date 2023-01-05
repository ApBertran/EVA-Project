#!/usr/bin/python

import os

src = '/usr/bin/python'
dst = '/tmp/python'

# This creates a symbolic link on python in tmp directory
os.symlink(src, dst)

print("symlink created")
