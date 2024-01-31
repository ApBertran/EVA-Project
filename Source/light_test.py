import sys
f = open("pytest.txt", "w")
f.write('params:'+' '+sys.argv[1]+' '+sys.argv[2])
print('test')